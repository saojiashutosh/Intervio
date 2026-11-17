import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Predict } from '../components/Predict'

const N = 64
type Mode = 'seq' | 'btree'

export default function IndexViz() {
  const [mode, setMode] = useState<Mode>('seq')
  const [target, setTarget] = useState(37)
  const [limit1, setLimit1] = useState(false)
  const [tick, setTick] = useState(0)        // how many "reads" have happened
  const [running, setRunning] = useState(false)
  const [pct, setPct] = useState(2)

  const total = mode === 'seq' ? (limit1 ? target : N) : 4
  useEffect(() => { setTick(0); setRunning(false) }, [mode, target, limit1])
  useEffect(() => {
    if (!running) return
    if (tick >= total) { setRunning(false); return }
    const t = setTimeout(() => setTick((x) => x + 1), mode === 'seq' ? 45 : 650)
    return () => clearTimeout(t)
  }, [running, tick, total, mode])

  const t0 = target - 1
  const internal = Math.floor(t0 / 16)
  const leaf = Math.floor(t0 / 4)
  const hit = (id: number) => (id === target ? 'found' : '')

  const cells = Array.from({ length: N }, (_, i) => i + 1)
  const scanned = (id: number) => (mode === 'seq' ? id <= tick : mode === 'btree' && tick >= 4 && id === target)

  const sel = useMemo(() => cells.map((id) => (id * 37) % 100 < pct), [pct]) // eslint-disable-line react-hooks/exhaustive-deps
  const matches = sel.filter(Boolean).length
  const planner = pct < 15 ? 'Index / Bitmap scan' : 'Sequential scan'

  const depth = (rows: number) => Math.ceil(Math.log(rows) / Math.log(300)) + 1 // ~300 keys per B-tree page + 1 heap fetch

  return (
    <div>
      <Predict
        question={`SELECT * FROM products WHERE id = ${target}; on a 64-row table with NO index and no LIMIT. How many rows does PostgreSQL read?`}
        options={['1', `${target}`, '64 (all of them)']} answer={2}
        why="Without an index (and without LIMIT 1) it cannot know the match is unique, so it must examine every row. Tick “LIMIT 1” to see the difference."
      />

      <div className="seg" role="group" aria-label="Access method">
        <button className={mode === 'seq' ? 'on' : ''} onClick={() => setMode('seq')}>Seq Scan (no index)</button>
        <button className={mode === 'btree' ? 'on' : ''} onClick={() => setMode('btree')}>B-tree Index Scan</button>
      </div>

      <div className="viz-row">
        <label className="field">Look for id
          <input type="range" min={1} max={N} value={target} onChange={(e) => setTarget(+e.target.value)} />
          <b>{target}</b>
        </label>
        {mode === 'seq' && (
          <label className="check"><input type="checkbox" checked={limit1} onChange={(e) => setLimit1(e.target.checked)} /> add LIMIT 1</label>
        )}
        <button className="primary" onClick={() => { setTick(0); setRunning(true) }}>Run query</button>
        <span className="chip big">{mode === 'seq' ? 'rows read' : 'pages read'}: <b>{Math.min(tick, total)}</b></span>
      </div>

      {mode === 'btree' && (
        <div className="tree" aria-label="B-tree levels">
          <div className="tree-level"><span className={`node ${tick >= 1 ? 'on' : ''}`}>root</span></div>
          <div className="tree-level">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`node ${tick >= 2 && i === internal ? 'on' : ''}`}>{i * 16 + 1}–{i * 16 + 16}</span>)}
          </div>
          <div className="tree-level leaves">
            {Array.from({ length: 16 }, (_, i) => <span key={i} className={`node sm ${tick >= 3 && i === leaf ? 'on' : ''}`}>{i * 4 + 1}</span>)}
          </div>
          <p className="muted small">root → internal → leaf → then ONE heap fetch for the row itself.</p>
        </div>
      )}

      <div className="heap" role="img" aria-label="Table rows">
        {cells.map((id) => (
          <motion.span
            key={id}
            className={`cell ${scanned(id) ? 'read' : ''} ${scanned(id) ? hit(id) : ''}`}
            animate={{ scale: scanned(id) && id === target ? 1.25 : 1 }}
          >{id}</motion.span>
        ))}
      </div>

      <div className="grid2">
        <div className="panel">
          <h4>Why it matters at scale</h4>
          <table className="mini">
            <thead><tr><th>Table rows</th><th>Seq scan reads</th><th>B-tree reads</th></tr></thead>
            <tbody>
              {[10_000, 1_000_000, 100_000_000].map((r) => (
                <tr key={r}><td>{r.toLocaleString()}</td><td>{r.toLocaleString()}</td><td>~{depth(r)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Seq scan grows linearly; a B-tree grows with the log of the table (very high base).</p>
        </div>

        <div className="panel">
          <h4>Break it: low selectivity</h4>
          <label className="field">Rows matching the filter
            <input type="range" min={1} max={100} value={pct} onChange={(e) => setPct(+e.target.value)} />
            <b>{pct}%</b>
          </label>
          <div className="heap tiny">{cells.map((id, i) => <span key={id} className={`cell sm ${sel[i] ? 'match' : ''}`} />)}</div>
          <p className={`note ${pct < 15 ? 'good' : 'bad'}`}>
            {matches}/{N} rows match → planner picks <b>{planner}</b>.{' '}
            {pct >= 15 && 'Walking the index AND jumping around the table for most rows costs more than one straight pass. This is why an index on a boolean like active rarely helps.'}
          </p>
        </div>
      </div>
    </div>
  )
}
