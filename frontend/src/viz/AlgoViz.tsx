import { useMemo, useState } from 'react'
import { Predict } from '../components/Predict'
import { Controls, useStepper } from '../components/Timeline'

type Tone = 'cur' | 'q' | 'win' | 'done' | 'found' | 'lo' | 'hi'
interface Frame {
  cells: (string | number)[]
  marks: Record<number, { label: string; tone: Tone }>
  dim?: number[]
  note: string
  vars?: Record<string, string>
  lists?: Record<string, string[]>
  good?: boolean
}

const SORTED = [2, 5, 8, 12, 16, 23, 38, 42, 56, 72, 91]

function put(marks: Frame['marks'], i: number, label: string, tone: Tone) {
  marks[i] = marks[i] ? { label: `${marks[i].label}/${label}`, tone: marks[i].tone } : { label, tone }
}

function binarySearch(target: number): Frame[] {
  const f: Frame[] = []
  let lo = 0, hi = SORTED.length - 1, steps = 0
  const dimOutside = (l: number, h: number) => SORTED.map((_, i) => i).filter((i) => i < l || i > h)
  f.push({ cells: SORTED, marks: {}, note: `Find ${target} in a SORTED list of ${SORTED.length}. The idea: look in the middle, and throw half away.`, vars: { target: String(target), steps: '0' } })
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2); steps++
    const marks: Frame['marks'] = {}
    put(marks, lo, 'lo', 'lo'); put(marks, hi, 'hi', 'hi'); put(marks, mid, 'mid', 'cur')
    const v = SORTED[mid]
    if (v === target) {
      f.push({ cells: SORTED, marks: { ...marks, [mid]: { label: 'found', tone: 'found' } }, dim: dimOutside(lo, hi), note: `mid = ${mid}: ${v} equals ${target}. Found after ${steps} look${steps > 1 ? 's' : ''}, out of ${SORTED.length} items.`, vars: { target: String(target), steps: String(steps) }, good: true })
      return f
    }
    f.push({ cells: SORTED, marks, dim: dimOutside(lo, hi), note: `mid = ${mid}: ${v} is ${v < target ? 'less' : 'greater'} than ${target}, so everything ${v < target ? 'at or left of' : 'at or right of'} mid cannot hold it. ${v < target ? `lo = ${mid + 1}` : `hi = ${mid - 1}`}.`, vars: { target: String(target), steps: String(steps) } })
    if (v < target) lo = mid + 1; else hi = mid - 1
  }
  f.push({ cells: SORTED, marks: {}, dim: SORTED.map((_, i) => i), note: `lo passed hi: the range is empty, so ${target} is not in the list. It took only ${steps} look${steps > 1 ? 's' : ''}. Each look halves the range, which is why the cost is O(log n).`, vars: { target: String(target), steps: String(steps) } })
  return f
}

function twoPointers(target: number): Frame[] {
  const f: Frame[] = []
  let l = 0, r = SORTED.length - 1
  f.push({ cells: SORTED, marks: { [l]: { label: 'L', tone: 'lo' }, [r]: { label: 'R', tone: 'hi' } }, note: `Find two numbers that add up to ${target} in a SORTED list. Put one pointer at each end.`, vars: { target: String(target), sum: '-' } })
  while (l < r) {
    const s = SORTED[l] + SORTED[r]
    const marks: Frame['marks'] = { [l]: { label: 'L', tone: 'lo' }, [r]: { label: 'R', tone: 'hi' } }
    if (s === target) {
      f.push({ cells: SORTED, marks: { [l]: { label: 'L', tone: 'found' }, [r]: { label: 'R', tone: 'found' } }, note: `${SORTED[l]} + ${SORTED[r]} = ${s}. Found the pair in one pass.`, vars: { target: String(target), sum: String(s) }, good: true })
      return f
    }
    f.push({ cells: SORTED, marks, note: `${SORTED[l]} + ${SORTED[r]} = ${s}, which is ${s < target ? 'too small, so move L right to get a bigger sum' : 'too big, so move R left to get a smaller sum'}.`, vars: { target: String(target), sum: String(s) } })
    if (s < target) l++; else r--
  }
  f.push({ cells: SORTED, marks: {}, dim: SORTED.map((_, i) => i), note: `The pointers met without a match, so no pair adds up to ${target}. Each pointer only moved one way, so it took at most n steps: O(n), not O(n²).`, vars: { target: String(target), sum: '-' } })
  return f
}

const WIN = [2, 1, 5, 1, 3, 2, 9, 1, 1]
function slidingWindow(): Frame[] {
  const k = 3, f: Frame[] = []
  let sum = WIN.slice(0, k).reduce((a, b) => a + b, 0), best = sum, bestAt = 0
  const win = (s: number) => Object.fromEntries(Array.from({ length: k }, (_, j) => [s + j, { label: j === 0 ? 'start' : j === k - 1 ? 'end' : '', tone: 'win' as Tone }]))
  f.push({ cells: WIN, marks: win(0), note: `Best sum of any ${k} neighbours. First window: add the first ${k} numbers = ${sum}.`, vars: { sum: String(sum), best: String(best) } })
  for (let s = 1; s + k <= WIN.length; s++) {
    const out = WIN[s - 1], inn = WIN[s + k - 1]
    sum = sum - out + inn
    if (sum > best) { best = sum; bestAt = s }
    f.push({ cells: WIN, marks: win(s), note: `Slide right: drop ${out}, add ${inn}. New sum = ${sum}. One subtraction and one addition, not re-adding ${k} numbers.${sum === best && bestAt === s ? ' New best!' : ''}`, vars: { sum: String(sum), best: String(best) } })
  }
  f.push({ cells: WIN, marks: win(bestAt), note: `Best window starts at index ${bestAt} with sum ${best}. Total work is O(n), versus O(n x k) if every window were re-added.`, vars: { sum: String(sum), best: String(best) }, good: true })
  return f
}

const GRAPH: Record<string, string[]> = { A: ['B', 'C'], B: ['D', 'E'], C: ['F'], D: [], E: ['F'], F: ['G'], G: [] }
function bfs(): Frame[] {
  const names = Object.keys(GRAPH), f: Frame[] = []
  const dist: Record<string, number> = { A: 0 }
  const queue = ['A'], seen = new Set(['A']), order: string[] = []
  const frame = (note: string, cur?: string, good = false): Frame => {
    const marks: Frame['marks'] = {}
    names.forEach((n, i) => {
      if (n === cur) marks[i] = { label: 'cur', tone: 'cur' }
      else if (order.includes(n)) marks[i] = { label: `d=${dist[n]}`, tone: 'done' }
      else if (queue.includes(n)) marks[i] = { label: `d=${dist[n]}`, tone: 'q' }
    })
    return { cells: names, marks, note, lists: { queue: [...queue], visited: [...order] }, good }
  }
  f.push(frame('Graph edges: A→B, A→C, B→D, B→E, C→F, E→F, F→G. BFS explores in rings: everything 1 hop away, then 2 hops, and so on. It uses a QUEUE (first in, first out).'))
  while (queue.length) {
    const cur = queue.shift() as string
    order.push(cur)
    const added: string[] = []
    for (const nb of GRAPH[cur]) if (!seen.has(nb)) { seen.add(nb); dist[nb] = dist[cur] + 1; queue.push(nb); added.push(nb) }
    f.push(frame(`Take ${cur} from the front of the queue (distance ${dist[cur]}). ${added.length ? `Enqueue its unseen neighbours: ${added.join(', ')}.` : 'It has no unseen neighbours.'}`, cur))
  }
  f.push(frame(`Queue empty. Because BFS visits in distance order, the first time it reaches a node is the SHORTEST path: G is ${dist.G} hops from A. Each node and edge is handled once: O(V + E). The 'seen' set stops infinite loops on cycles.`, undefined, true))
  return f
}

type Algo = 'binary' | 'two' | 'window' | 'bfs'

export default function AlgoViz() {
  const [algo, setAlgo] = useState<Algo>('binary')
  const [target, setTarget] = useState(23)
  const key = `${algo}-${target}`
  const frames = useMemo(() => {
    if (algo === 'binary') return binarySearch(target)
    if (algo === 'two') return twoPointers(target)
    if (algo === 'window') return slidingWindow()
    return bfs()
  }, [algo, target])
  const s = useStepper(frames.length, key)
  const fr = frames[Math.max(s.i, 0)]
  const targets = algo === 'binary' ? [23, 91, 7] : [54, 100]
  const pick = (a: Algo) => { setAlgo(a); setTarget(a === 'binary' ? 23 : 54) }

  return (
    <div>
      <Predict
        question="A sorted list has 1,000,000 numbers. About how many comparisons does binary search need in the worst case?"
        options={['About 20', 'About 1,000', 'About 500,000']} answer={0}
        why="Each step throws away half the range. 2^20 is about a million, so 20 halvings are enough. Linear search could need all 1,000,000."
      />
      <div className="seg" role="group" aria-label="Algorithm">
        <button className={algo === 'binary' ? 'on' : ''} onClick={() => pick('binary')}>Binary search</button>
        <button className={algo === 'two' ? 'on' : ''} onClick={() => pick('two')}>Two pointers</button>
        <button className={algo === 'window' ? 'on' : ''} onClick={() => pick('window')}>Sliding window</button>
        <button className={algo === 'bfs' ? 'on' : ''} onClick={() => pick('bfs')}>BFS (graph)</button>
      </div>
      {(algo === 'binary' || algo === 'two') && (
        <div className="seg" role="group" aria-label="Target value">
          {targets.map((t) => <button key={t} className={target === t ? 'on' : ''} onClick={() => setTarget(t)}>{algo === 'binary' ? 'Find' : 'Sum'} {t}{algo === 'binary' && t === 7 ? ' (absent)' : ''}{algo === 'two' && t === 100 ? ' (no pair)' : ''}</button>)}
        </div>
      )}
      <Controls s={s} length={frames.length} />
      <div className="acells" aria-label="Array state">
        {fr.cells.map((c, i) => {
          const m = fr.marks[i]
          return (
            <div key={i} className="acol">
              <div className={`acell ${m ? m.tone : ''} ${fr.dim?.includes(i) ? 'dim' : ''}`}>{c}</div>
              <div className="aidx">{algo === 'bfs' ? '' : i}</div>
              <div className="alabel">{m?.label ?? ''}</div>
            </div>
          )
        })}
      </div>
      {fr.vars && <div className="statebar">{Object.entries(fr.vars).map(([k, v]) => <span key={k} className="chip">{k}: <b>{v}</b></span>)}</div>}
      {fr.lists && <div className="statebar">{Object.entries(fr.lists).map(([k, v]) => <span key={k} className="chip">{k}: <b>[{v.join(', ')}]</b></span>)}</div>}
      <p className={`note ${fr.good ? 'good' : ''}`} role="status">{fr.note}</p>
    </div>
  )
}
