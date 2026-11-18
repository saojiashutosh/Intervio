import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useContent } from '../context'
import { CodeBlock } from '../components/CodeBlock'
import { runCases, stopRun, type RunResult, type RunStatus } from '../lib/pyrunner'
import type { ProblemFull, ProblemRow } from '../types'

const SOLVED_KEY = 'intervio.solved'
const DIFFS = ['easy', 'medium', 'hard'] as const

export function useSolved() {
  const read = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(SOLVED_KEY) ?? '[]')) } catch { return new Set<string>() } }
  const [solved, setSolved] = useState<Set<string>>(read)
  const mark = (slug: string) => {
    setSolved((prev) => {
      const next = new Set(prev).add(slug)
      try { localStorage.setItem(SOLVED_KEY, JSON.stringify([...next])) } catch { /* private mode: still shown this session */ }
      return next
    })
  }
  return { solved, mark }
}

export function ProblemsPage() {
  const { content } = useContent()
  const [rows, setRows] = useState<ProblemRow[] | null>(null)
  const [error, setError] = useState('')
  const [level, setLevel] = useState<'all' | (typeof DIFFS)[number]>('all')
  const { solved } = useSolved()
  useEffect(() => { api.problems().then(setRows).catch((e) => setError(String(e.message ?? e))) }, [])

  const groups = useMemo(() => {
    if (!rows || !content) return []
    const order = new Map(content.concepts.map((c, i) => [c.slug, i]))
    const by = new Map<string, ProblemRow[]>()
    for (const r of rows) if (level === 'all' || r.difficulty === level) by.set(r.concept ?? '', [...(by.get(r.concept ?? '') ?? []), r])
    return [...by.entries()].sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999))
  }, [rows, content, level])

  if (error) return <p role="alert">{error}</p>
  if (!rows) return <p className="muted">Loading problems…</p>
  const done = rows.filter((r) => solved.has(r.slug)).length
  return (
    <>
      <h1>Problem bank</h1>
      <p className="lead">{rows.length} practice problems for the data structures and algorithms track. Write Python in the page and run it against the tests, with nothing to install. The statements are original; they are classic interview problems described in my own words.</p>
      <p className="muted">{done} of {rows.length} solved on this device. <span className="seg" aria-label="Difficulty">
        {(['all', ...DIFFS] as const).map((d) => <button key={d} className={level === d ? 'on' : ''} onClick={() => setLevel(d)}>{d}</button>)}
      </span></p>
      {groups.map(([slug, list]) => (
        <section key={slug} className="card">
          <h3>{list[0].concept_title ?? 'Other'} {slug && <Link className="muted" to={`/concept/${slug}`}>lesson</Link>}</h3>
          <ul className="problem-list">
            {list.map((r) => (
              <li key={r.slug}>
                <Link to={`/problems/${r.slug}`}><span className={`dot ${solved.has(r.slug) ? 'solved' : ''}`} aria-hidden>{solved.has(r.slug) ? '✓' : ''}</span>{r.title}</Link>
                <span className={`diff ${r.difficulty}`}>{r.difficulty}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

export function ProblemPage() {
  const { slug = '' } = useParams()
  const [p, setP] = useState<ProblemFull | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { setP(null); api.problem(slug).then(setP).catch((e) => setError(String(e.message ?? e))) }, [slug])
  if (error) return <p role="alert">{error}</p>
  if (!p) return <p className="muted">Loading…</p>
  return <Workspace key={p.slug} p={p} />
}

function Workspace({ p }: { p: ProblemFull }) {
  const draftKey = `intervio.draft.${p.slug}`
  const [code, setCode] = useState(() => { try { return localStorage.getItem(draftKey) ?? p.starter } catch { return p.starter } })
  const [status, setStatus] = useState<RunStatus | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [fail, setFail] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [hints, setHints] = useState(0)
  const [showSolution, setShowSolution] = useState(false)
  const { solved, mark } = useSolved()
  const area = useRef<HTMLTextAreaElement>(null)

  const save = (v: string) => { setCode(v); try { localStorage.setItem(draftKey, v) } catch { /* ignore */ } }
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {                          // a tab inserts four spaces instead of leaving the editor
      e.preventDefault()
      const t = e.currentTarget
      const next = t.value.slice(0, t.selectionStart) + '    ' + t.value.slice(t.selectionEnd)
      save(next)
      requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = t.selectionStart + 4 })
    }
  }
  // While a run is going, count seconds so a learner can see that it is still working (there is no time limit, only Stop).
  useEffect(() => {
    if (status !== 'running') { setElapsed(0); return }
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(id)
  }, [status])
  const run = async () => {
    setFail(''); setResult(null)
    try {
      const r = await runCases(p.prelude, code, p.cases, setStatus)
      setResult(r)
      if (!r.stopped && !r.error && r.results.length && r.results.every((c) => c.ok)) mark(p.slug)
    } catch (e) { setFail(String((e as Error).message ?? e)) }
    setStatus(null)
  }
  const passed = result?.results.filter((c) => c.ok).length ?? 0
  const allPassed = !!result && !result.stopped && !result.error && result.results.length > 0 && passed === result.results.length

  return (
    <>
      <p className="muted"><Link to="/problems">← Problem bank</Link>{p.concept && <> · <Link to={`/concept/${p.concept}`}>{p.concept_title}</Link></>}</p>
      <h1>{p.title} <span className={`diff ${p.difficulty}`}>{p.difficulty}</span> {solved.has(p.slug) && <span className="tag">solved</span>}</h1>
      <div className="card"><p>{p.statement}</p>
        {p.examples.map((e, i) => <p key={i} className="example"><b>Example:</b> <code>{e.input}</code> → <code>{e.output}</code>{e.note && <span className="muted"> ({e.note})</span>}</p>)}
      </div>

      <h2>Your code</h2>
      <textarea ref={area} className="editor" value={code} spellCheck={false} aria-label="Python code" onChange={(e) => save(e.target.value)} onKeyDown={onKey} rows={Math.max(10, code.split('\n').length + 2)} />
      <p className="editor-actions">
        {status === 'running'
          ? <button className="danger" onClick={stopRun}>Stop ({elapsed} s)</button>
          : <button className="primary" onClick={run} disabled={status !== null}>{status === 'loading' ? 'Loading Python…' : 'Run tests'}</button>}
        <button className="ghost" onClick={() => save(p.starter)} disabled={status !== null}>Reset</button>
        <button className="ghost" onClick={() => setHints((h) => Math.min(h + 1, p.hints.length))} disabled={hints >= p.hints.length}>Hint {hints}/{p.hints.length}</button>
      </p>
      <p className="muted small">Python runs in your browser (Pyodide, about 10 MB the first time, then cached). Nothing you type is sent to the server. There is no time limit: a run goes on until it finishes, and you can press Stop.</p>
      {status === 'running' && elapsed >= 15 && <p className="muted small" role="status">Still running after {elapsed} s. If this looks like an infinite loop or a very slow solution, press Stop.</p>}
      {fail && <p role="alert" className="alert">{fail}</p>}
      {hints > 0 && <div className="card"><b>Hints</b><ol>{p.hints.slice(0, hints).map((h, i) => <li key={i}>{h}</li>)}</ol></div>}

      {result && (
        <div className="card results" aria-live="polite">
          {result.stopped && <p role="alert" className="alert">Stopped. If it was still running, check for an infinite loop or for a solution that is slower than the tests expect (some tests use 100,000 items).</p>}
          {result.error && <p role="alert" className="alert">Your code did not run: <code>{result.error}</code></p>}
          {!result.stopped && !result.error && <p><b>{allPassed ? 'All tests passed.' : `${passed} of ${result.results.length} tests passed.`}</b></p>}
          <ul className="case-list">
            {result.results.map((c) => <li key={c.name} className={c.ok ? 'ok' : 'bad'}><span aria-hidden>{c.ok ? '✓' : '✗'}</span> {c.name}{!c.ok && c.error && <span className="muted"> — {c.error}</span>}</li>)}
          </ul>
        </div>
      )}

      <details className="card"><summary>The tests ({p.cases.length})</summary>
        <p className="muted small">The tests are visible on purpose: read what each one checks. The speed tests are what separate a good solution from a slow one.</p>
        <CodeBlock code={p.cases.map((c) => `# ${c.name}\n${c.code}`).join('\n')} lang="py" title="tests" /></details>

      <p>{!showSolution ? <button className="ghost" onClick={() => setShowSolution(true)}>Show a reference solution</button> : null}</p>
      {showSolution && (
        <div className="card"><b>Reference solution</b>
          <CodeBlock code={p.solution} lang="py" title="solution" />
          <p>{p.notes}</p></div>
      )}
    </>
  )
}
