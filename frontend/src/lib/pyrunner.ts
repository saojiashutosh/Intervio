/**
 * Runs a learner's Python against a problem's cases in the browser, with Pyodide (CPython compiled to WebAssembly) inside a Web Worker.
 * There is no time limit on a run. The worker is what keeps that safe: an infinite loop only occupies the worker, and the learner can press Stop, which terminates it.
 * Nothing the learner types is sent to our server. Pyodide itself is downloaded from a CDN the first time (about 10 MB, then cached).
 */
export interface CaseResult { name: string; ok: boolean; error?: string }
export interface RunResult { results: CaseResult[]; error?: string; stopped?: boolean }
export type RunStatus = 'loading' | 'running'

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'
const LOAD_LIMIT_MS = 90_000

// Runs once per attempt inside Pyodide. Every case is an independent snippet that must not raise.
const HARNESS = [
  'import json',
  'ns = {"__name__": "problem"}',
  'results = []',
  'compile_error = None',
  'try:',
  '    exec(compile(PRELUDE + chr(10) + CODE, "your code", "exec"), ns)',
  'except BaseException as e:',
  '    compile_error = type(e).__name__ + ": " + str(e)',
  'if compile_error is None:',
  '    for name, code in CASES:',
  '        try:',
  '            exec(compile(code, name, "exec"), ns)',
  '            results.append({"name": name, "ok": True})',
  '        except AssertionError:',
  '            results.append({"name": name, "ok": False, "error": "wrong answer"})',
  '        except RecursionError:',
  '            results.append({"name": name, "ok": False, "error": "RecursionError: recursion too deep"})',
  '        except BaseException as e:',
  '            results.append({"name": name, "ok": False, "error": (type(e).__name__ + ": " + str(e))[:160]})',
  'json.dumps({"results": results, "error": compile_error})',
].join('\n')

const WORKER_SOURCE = `
let py = null
self.onmessage = async (e) => {
  const m = e.data
  if (m.type === 'init') {
    try {
      importScripts(${JSON.stringify(PYODIDE_URL + 'pyodide.js')})
      py = await loadPyodide({ indexURL: ${JSON.stringify(PYODIDE_URL)} })
      self.postMessage({ type: 'ready' })
    } catch (err) { self.postMessage({ type: 'init-error', error: String(err) }) }
    return
  }
  if (m.type === 'run') {
    try {
      py.globals.set('PRELUDE', m.prelude)
      py.globals.set('CODE', m.code)
      py.globals.set('CASES', py.toPy(m.cases.map((c) => [c.name, c.code])))
      self.postMessage({ type: 'result', id: m.id, payload: py.runPython(${JSON.stringify(HARNESS)}) })
    } catch (err) { self.postMessage({ type: 'result', id: m.id, error: String(err) }) }
  }
}
`

let worker: Worker | null = null
let ready: Promise<void> | null = null
let nextId = 1

function start(): Promise<void> {
  if (typeof Worker === 'undefined') return Promise.reject(new Error('This browser cannot run Python here (no Web Worker support).'))
  const blob = new Blob([WORKER_SOURCE], { type: 'text/javascript' })
  const w = new Worker(URL.createObjectURL(blob))
  worker = w
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { w.terminate(); worker = null; ready = null; reject(new Error('Python took too long to load. Check your connection and try again.')) }, LOAD_LIMIT_MS)
    w.onmessage = (e) => {
      if (e.data.type === 'ready') { clearTimeout(timer); resolve() }
      if (e.data.type === 'init-error') {
        clearTimeout(timer); w.terminate(); worker = null; ready = null
        reject(new Error(`Could not load the Python runtime (it is downloaded from a CDN). Check your connection and try again. (${String(e.data.error).slice(0, 160)})`))
      }
    }
    w.onerror = () => { clearTimeout(timer); worker = null; ready = null; reject(new Error('The Python runtime failed to start.')) }
    w.postMessage({ type: 'init' })
  })
}

let stopCurrent: (() => void) | null = null
/** Stop the run in progress (the worker is terminated and a fresh one starts on the next run). */
export function stopRun() { stopCurrent?.() }

export async function runCases(prelude: string, code: string, cases: { name: string; code: string }[], onStatus?: (s: RunStatus) => void): Promise<RunResult> {
  if (!worker || !ready) {
    onStatus?.('loading')
    ready = start()
  }
  await ready
  const w = worker!
  onStatus?.('running')
  const id = nextId++
  return new Promise<RunResult>((resolve) => {
    stopCurrent = () => {
      w.terminate(); worker = null; ready = null            // the next run starts a fresh worker
      stopCurrent = null
      resolve({ results: [], stopped: true })
    }
    w.onmessage = (e) => {
      const m = e.data
      if (m.type !== 'result' || m.id !== id) return
      stopCurrent = null
      if (m.error) { resolve({ results: [], error: m.error }); return }
      resolve(JSON.parse(m.payload) as RunResult)
    }
    // The worker can die in the middle of a run (for example when the code uses up all the memory). Without this the page
    // would wait for an answer that never comes.
    w.onerror = () => {
      w.terminate(); worker = null; ready = null; stopCurrent = null
      resolve({ results: [], error: 'The Python runtime stopped unexpectedly (it may have run out of memory). Try again.' })
    }
    w.postMessage({ type: 'run', id, prelude, code, cases })
  })
}
