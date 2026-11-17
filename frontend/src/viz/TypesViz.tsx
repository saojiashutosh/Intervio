import { useMemo, useState } from 'react'
import { Predict } from '../components/Predict'

type Tab = 'money' | 'time' | 'null'
const ZONES = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Tokyo']

function Money() {
  const [n, setN] = useState(0)
  const float = useMemo(() => { let s = 0; for (let i = 0; i < n; i++) s += 0.1; return s }, [n])
  const exact = (n * 10) / 100 // integer paise, divided once for display: what NUMERIC does
  return (
    <div>
      <div className="viz-row">
        <button className="primary" onClick={() => setN((x) => Math.min(x + 1, 10))}>Add ₹0.10</button>
        <button className="ghost" onClick={() => setN(3)}>Jump to 3</button>
        <button className="ghost" onClick={() => setN(0)}>Reset</button>
        <span className="chip">added: <b>{n}</b> × 0.10</span>
      </div>
      <div className="grid2">
        <div className={`panel ${n > 0 && float !== exact ? 'bad-panel' : ''}`}>
          <h4>FLOAT / double precision</h4>
          <p className="big-num">{float}</p>
          <p className="small">equals {exact.toFixed(2)}? <b>{float === exact ? 'yes' : 'NO'}</b></p>
        </div>
        <div className="panel good-panel">
          <h4>NUMERIC(12,2)</h4>
          <p className="big-num">{exact.toFixed(2)}</p>
          <p className="small">exact decimal arithmetic: always correct</p>
        </div>
      </div>
      <p className="muted small">Floats store binary fractions, and 0.1 has no exact binary form. Errors accumulate in totals. Use NUMERIC (Django DecimalField) or integer minor units for money.</p>
    </div>
  )
}

function Time() {
  const [zone, setZone] = useState('Asia/Kolkata')
  const instant = new Date('2026-11-16T09:30:00Z')
  const show = (tz: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(instant)
  return (
    <div>
      <p>An order was placed at the instant <b>2026-11-16 09:30 UTC</b>. The row was inserted by a server running in India (IST).</p>
      <div className="viz-row">
        <label className="field">Session time zone
          <select value={zone} onChange={(e) => setZone(e.target.value)}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select>
        </label>
      </div>
      <div className="grid2">
        <div className="panel good-panel"><h4>timestamptz</h4><p className="big-num">{show(zone)}</p><p className="small">One absolute instant. Shown in your session's zone.</p></div>
        <div className="panel bad-panel"><h4>timestamp (no zone)</h4><p className="big-num">{show('Asia/Kolkata')}</p><p className="small">Whatever wall-clock text was inserted. Is that IST or UTC? The column cannot say.</p></div>
      </div>
      <p className="muted small">Store events as timestamptz (Django DateTimeField with USE_TZ = True) and convert for display. Use DATE for calendar dates like a birthday.</p>
    </div>
  )
}

const ROWS: { id: string; discount: number | null }[] = [{ id: 'A', discount: 10 }, { id: 'B', discount: null }, { id: 'C', discount: 30 }]
const QUERIES: { sql: string; match: (d: number | null) => boolean; why: string }[] = [
  { sql: 'WHERE discount = NULL', match: () => false, why: 'NULL = NULL is not true, it is NULL, so no row ever matches. Use IS NULL.' },
  { sql: 'WHERE discount IS NULL', match: (d) => d === null, why: 'IS NULL is the right test for a missing value.' },
  { sql: 'WHERE discount <> 10', match: (d) => d !== null && d !== 10, why: 'B is silently excluded: NULL <> 10 is NULL, not true. Three-valued logic bites here.' },
  { sql: 'WHERE discount <> 10 OR discount IS NULL', match: (d) => d === null || d !== 10, why: 'Handle NULL explicitly to include B.' },
  { sql: 'WHERE COALESCE(discount, 0) <> 10', match: (d) => (d ?? 0) !== 10, why: 'COALESCE turns NULL into a default before comparing.' },
]

function Nulls() {
  const [qi, setQi] = useState(2)
  const q = QUERIES[qi]
  return (
    <div>
      <div className="viz-row">{QUERIES.map((x, i) => <button key={x.sql} className={`chipbtn ${qi === i ? 'on' : ''}`} onClick={() => setQi(i)}>{x.sql.replace('WHERE ', '')}</button>)}</div>
      <pre className="codebox">{`SELECT id FROM products\n${q.sql};`}</pre>
      <table className="mini nulltable">
        <thead><tr><th>id</th><th>discount</th><th>returned?</th></tr></thead>
        <tbody>{ROWS.map((r) => {
          const hit = q.match(r.discount)
          return <tr key={r.id} className={hit ? 'good' : 'dim'}><td>{r.id}</td><td>{r.discount === null ? <em className="null">NULL</em> : r.discount}</td><td>{hit ? '✔ yes' : '✗ no'}</td></tr>
        })}</tbody>
      </table>
      <p className="note">{q.why}</p>
    </div>
  )
}

export default function TypesViz() {
  const [tab, setTab] = useState<Tab>('money')
  return (
    <div>
      <Predict
        question="In a typical floating-point language, what is 0.1 + 0.2?"
        options={['Exactly 0.3', 'Very slightly more than 0.3']} answer={1}
        why="It is 0.30000000000000004. That is why money must never be a float. Try it with the buttons below."
      />
      <div className="seg" role="group" aria-label="Topic">
        <button className={tab === 'money' ? 'on' : ''} onClick={() => setTab('money')}>Money: FLOAT vs NUMERIC</button>
        <button className={tab === 'time' ? 'on' : ''} onClick={() => setTab('time')}>Time: timestamptz</button>
        <button className={tab === 'null' ? 'on' : ''} onClick={() => setTab('null')}>NULL logic</button>
      </div>
      {tab === 'money' ? <Money /> : tab === 'time' ? <Time /> : <Nulls />}
    </div>
  )
}
