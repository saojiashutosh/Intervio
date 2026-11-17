import { useMemo, useState } from 'react'
import { Timeline, type Step } from '../components/Timeline'
import { Predict } from '../components/Predict'

type Level = 'READ COMMITTED' | 'REPEATABLE READ'

function buildSteps(level: Level): Step[] {
  const rc = level === 'READ COMMITTED'
  return [
    { lane: 'A', title: 'BEGIN', sql: `BEGIN ISOLATION LEVEL ${level};`, state: { committed: '10', 'A sees': '—' },
      note: rc ? 'READ COMMITTED takes a fresh snapshot for every statement.' : 'REPEATABLE READ takes ONE snapshot at the first statement and keeps it.' },
    { lane: 'A', title: 'First read', sql: 'SELECT available_qty FROM inventory WHERE product_id = 42;  → 10', state: { committed: '10', 'A sees': '10' } },
    { lane: 'B', title: 'Concurrent write', sql: 'UPDATE inventory SET available_qty = 7 WHERE product_id = 42;  -- autocommit', state: { committed: '7', 'A sees': '10' },
      note: 'Session B commits while A’s transaction is still open.' },
    rc
      ? { lane: 'A', title: 'Second read', sql: 'SELECT available_qty … → 7', state: { committed: '7', 'A sees': '7' }, tone: 'bad',
          note: 'Non-repeatable read: the same query inside one transaction returned a different answer. Fine for many things; dangerous for read-then-decide logic.' }
      : { lane: 'A', title: 'Second read', sql: 'SELECT available_qty … → 10', state: { committed: '7', 'A sees': '10' }, tone: 'good',
          note: 'Stable snapshot: A still sees 10 even though 7 is committed. (If A now tried to UPDATE this row it would get a serialization failure and must retry.)' },
    { lane: 'A', title: 'COMMIT', sql: 'COMMIT;', state: { committed: '7', 'A sees': rc ? '7' : '10 → 7 after commit' } },
  ]
}

export default function IsolationViz() {
  const [level, setLevel] = useState<Level>('READ COMMITTED')
  const steps = useMemo(() => buildSteps(level), [level])
  return (
    <div>
      <Predict
        question="Session A reads stock (10). Session B then commits stock = 7. Under READ COMMITTED, what does A’s SECOND read return?"
        options={['10', '7', 'An error']} answer={1}
        why="Each statement gets a new snapshot, so it sees B’s committed change. Switch to REPEATABLE READ below and compare."
      />
      <div className="seg" role="group" aria-label="Isolation level">
        {(['READ COMMITTED', 'REPEATABLE READ'] as Level[]).map((l) => (
          <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{l}</button>
        ))}
      </div>
      <Timeline steps={steps} resetKey={level} />
    </div>
  )
}
