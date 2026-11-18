import { useState } from 'react'
import { Predict } from '../components/Predict'
import { DataTable } from '../components/DataTable'

/** Rule of thumb used on this page: a CPython loop does very roughly 10^7 to 10^8 simple steps per second. Only the ratios matter. */
const OPS_PER_SEC = 1e8

const CLASSES: { name: string; f: (n: number) => number; example: string }[] = [
  { name: 'O(1)', f: () => 1, example: 'dict lookup, list index' },
  { name: 'O(log n)', f: (n) => Math.max(1, Math.ceil(Math.log2(n))), example: 'binary search' },
  { name: 'O(n)', f: (n) => n, example: 'scan a list, x in list' },
  { name: 'O(n log n)', f: (n) => n * Math.max(1, Math.log2(n)), example: 'sorting' },
  { name: 'O(n²)', f: (n) => n * n, example: 'nested loops over the same list' },
]

function fmtOps(x: number) {
  if (x >= 1e15) return '> 10¹⁵'
  if (x >= 1e9) return `${(x / 1e9).toFixed(1)} billion`
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)} million`
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)} thousand`
  return x.toFixed(0)
}
function fmtTime(sec: number) {
  if (sec < 1e-3) return '< 1 ms'
  if (sec < 1) return `${(sec * 1000).toFixed(0)} ms`
  if (sec < 60) return `${sec.toFixed(1)} s`
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} hours`
  if (sec < 86400 * 365) return `${(sec / 86400).toFixed(0)} days`
  return `${(sec / (86400 * 365)).toFixed(0)} years`
}

function Growth() {
  const [e, setE] = useState(4) // n = 10^e
  const n = Math.round(10 ** e)
  const max = CLASSES[CLASSES.length - 1].f(n)
  return (
    <div>
      <label className="logslider">
        <span>Input size n: <b>{n.toLocaleString()}</b></span>
        <input type="range" min={1} max={6} step={0.1} value={e} aria-label="Input size n" onChange={(ev) => setE(Number(ev.target.value))} />
      </label>
      <div className="bigo-rows" aria-label="Growth of each complexity class">
        {CLASSES.map((c) => {
          const ops = c.f(n)
          const w = Math.max(2, (Math.log10(ops + 1) / Math.log10(max + 1)) * 100)
          const sec = ops / OPS_PER_SEC
          return (
            <div key={c.name} className="bigo-row">
              <div className="bigo-name"><b>{c.name}</b><span className="muted small">{c.example}</span></div>
              <div className="bigo-bar"><div className={`bigo-fill ${sec > 10 ? 'bad' : sec > 0.5 ? 'wait' : 'good'}`} style={{ width: `${w}%` }} /></div>
              <div className="bigo-val"><b>{fmtOps(ops)}</b> steps<br /><span className="muted small">≈ {fmtTime(sec)}</span></div>
            </div>
          )
        })}
      </div>
      <p className="muted small">Bars use a log scale so everything fits. Times assume about 100 million simple steps per second, a rough rule of thumb. The point is the ratio between rows: at a million items, O(n²) is about a million times slower than O(n).</p>
    </div>
  )
}

function ListVsSet() {
  const [e, setE] = useState(4)
  const n = Math.round(10 ** e)
  const listOps = (n * (n - 1)) / 2
  return (
    <div>
      <p>Task: find whether a list of <b>{n.toLocaleString()}</b> ids contains a duplicate.</p>
      <label className="logslider">
        <span>List size n: <b>{n.toLocaleString()}</b></span>
        <input type="range" min={2} max={6} step={0.1} value={e} aria-label="List size n" onChange={(ev) => setE(Number(ev.target.value))} />
      </label>
      <DataTable title="Two ways to do it" cols={['Approach', 'Work', 'Estimated time']}
        rows={[
          { id: 1, cells: ['For each id, check "x in seen_list"', `${fmtOps(listOps)} comparisons (O(n²))`, fmtTime(listOps / OPS_PER_SEC)], tone: listOps / OPS_PER_SEC > 1 ? 'bad' : 'wait' },
          { id: 2, cells: ['For each id, check "x in seen_set"', `${fmtOps(n)} lookups (O(n))`, fmtTime(n / OPS_PER_SEC)], tone: 'good' },
        ]}
        note="Same idea, different data structure. A set or dict finds a key in O(1) on average, but 'x in list' has to scan." />
      <DataTable title="Cost of common operations (Python docs, average case)" cols={['Operation', 'list', 'dict / set']}
        rows={[
          { id: 'a', cells: ['x in c', 'O(n)', 'O(1)'] },
          { id: 'b', cells: ['add / append', 'O(1) amortized', 'O(1) amortized'] },
          { id: 'c', cells: ['insert or delete at the front', 'O(n)', 'n/a'] },
          { id: 'd', cells: ['sort', 'O(n log n)', 'n/a'] },
        ]}
        note="Dict and set O(1) is an average: the docs say that if every key hashed to the same value, each operation would degrade to O(n). 'Amortized' means an occasional append is O(n) when the list resizes, but the cost averages out." />
    </div>
  )
}

export default function BigOViz() {
  const [tab, setTab] = useState<'growth' | 'pick'>('growth')
  return (
    <div>
      <Predict
        question="You check 'have I seen this id?' for each of 100,000 incoming ids. Which collection makes the whole job fast?"
        options={['A list: seen.append(x), x in seen', 'A set: seen.add(x), x in seen', 'They are the same']} answer={1}
        why="'x in list' scans every element, so 100,000 checks cost about 5 billion comparisons. 'x in set' is a hash lookup, so it costs about 100,000. Same code shape, 50,000 times less work."
      />
      <div className="seg" role="group" aria-label="View">
        <button className={tab === 'growth' ? 'on' : ''} onClick={() => setTab('growth')}>1. How fast does it grow?</button>
        <button className={tab === 'pick' ? 'on' : ''} onClick={() => setTab('pick')}>2. Pick the data structure</button>
      </div>
      {tab === 'growth' ? <Growth /> : <ListVsSet />}
    </div>
  )
}
