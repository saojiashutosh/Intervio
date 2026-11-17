import { useMemo, useState } from 'react'
import { Timeline, type Step } from '../components/Timeline'
import { Predict } from '../components/Predict'

type Mode = 'naive' | 'atomic'

function buildSteps(mode: Mode): Step[] {
  if (mode === 'naive') {
    return [
      { lane: 'A', title: 'Buyer A reads stock', sql: 'SELECT available_qty … → 1', state: { stock: '1', orders: '0' } },
      { lane: 'B', title: 'Buyer B reads stock', sql: 'SELECT available_qty … → 1', state: { stock: '1', orders: '0' },
        note: 'Both read BEFORE either writes. Each now believes it can buy the last unit.' },
      { lane: 'A', title: 'A writes', sql: 'UPDATE … SET available_qty = 0;  INSERT order', state: { stock: '0', orders: '1' } },
      { lane: 'B', title: 'B writes (stale decision)', sql: 'UPDATE … SET available_qty = 0;  INSERT order', state: { stock: '0', orders: '2' }, tone: 'bad',
        note: 'Oversold: 2 orders for 1 unit. Note CHECK (available_qty >= 0) did NOT save us — B wrote 0, which is valid. The bug is the read-then-write gap (a lost update).' },
    ]
  }
  return [
    { lane: 'A', title: 'A: conditional UPDATE', sql: 'UPDATE inventory SET available_qty = available_qty - 1\nWHERE product_id = 42 AND available_qty >= 1;  → 1 row', state: { stock: '0 (uncommitted)', orders: '0' } },
    { lane: 'DB', title: 'Row locked by A', sql: 'row lock on product 42', state: { stock: '0 (uncommitted)', orders: '0' }, tone: 'wait' },
    { lane: 'B', title: 'B: same UPDATE… waits', sql: 'UPDATE inventory … WHERE available_qty >= 1;', state: { stock: '0 (uncommitted)', orders: '0' }, tone: 'wait',
      note: 'B blocks on A’s row lock. No stale read is possible, because the check and the write are one atomic statement.' },
    { lane: 'A', title: 'A: INSERT order, COMMIT', sql: 'INSERT INTO orders …;  COMMIT;', state: { stock: '0', orders: '1' } },
    { lane: 'B', title: 'B: lock released, re-checks', sql: 'WHERE available_qty >= 1  → 0 rows', state: { stock: '0', orders: '1' }, tone: 'good',
      note: 'PostgreSQL re-evaluates B’s WHERE against the newly committed row. 0 rows affected → the app reports “sold out”. Stock never goes below zero and exactly one order exists.' },
  ]
}

export default function LockViz() {
  const [mode, setMode] = useState<Mode>('naive')
  const steps = useMemo(() => buildSteps(mode), [mode])
  return (
    <div>
      <Predict
        question="Stock is 1. Two buyers each run: SELECT qty; if qty > 0 → UPDATE qty = 0. Both run at the same moment. How many orders get created?"
        options={['1', '2', 'It depends on luck of timing, and 2 is possible']} answer={2}
        why="Without a lock or an atomic conditional UPDATE, the interleaving decides. Step through the unsafe version, then switch to the fix."
      />
      <div className="seg" role="group" aria-label="Strategy">
        <button className={mode === 'naive' ? 'on' : ''} onClick={() => setMode('naive')}>⚠ Read, then write</button>
        <button className={mode === 'atomic' ? 'on' : ''} onClick={() => setMode('atomic')}>✔ Atomic conditional UPDATE</button>
      </div>
      <Timeline steps={steps} resetKey={mode} />
    </div>
  )
}
