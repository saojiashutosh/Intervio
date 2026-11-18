import { useState } from 'react'
import { Timeline, type Step } from '../components/Timeline'
import { Predict } from '../components/Predict'

type Mode = 'naive' | 'safe'

const STEPS: Record<Mode, Step[]> = {
  naive: [
    { lane: 'A', title: 'Deploy starts: old servers still running', state: { 'name column': 'exists', 'full_name column': 'missing', 'old code': 'reads name', 'new code': 'not deployed' }, note: 'A rolling deploy replaces servers one by one. For minutes, old and new code run at the same time.' },
    { lane: 'DB', title: 'Migration: RENAME COLUMN name TO full_name', sql: 'ALTER TABLE users RENAME COLUMN name TO full_name;', state: { 'name column': 'GONE', 'full_name column': 'exists', 'old code': 'reads name', 'new code': 'not deployed' }, tone: 'wait', note: 'The rename is instant, and it is also irreversible for anyone still using the old name.' },
    { lane: 'A', title: 'Old servers: SELECT name → ERROR', sql: 'ERROR: column "name" does not exist', state: { 'name column': 'GONE', 'full_name column': 'exists', 'old code': 'FAILING', 'new code': 'not deployed' }, tone: 'bad', note: 'Every request handled by an old server now fails with a 500. Users see errors until the last old server is replaced.' },
    { lane: 'B', title: 'New servers come up one by one', state: { 'name column': 'GONE', 'full_name column': 'exists', 'old code': 'FAILING (shrinking)', 'new code': 'reads full_name' }, tone: 'wait', note: 'Errors continue for the whole rollout. Rolling back the code does not help, because the column is already renamed.' },
    { lane: 'DB', title: 'Rollback needs a reverse migration', state: { 'name column': 'GONE', 'full_name column': 'exists', 'old code': 'FAILING', 'new code': 'reads full_name' }, tone: 'bad', note: 'Schema and code were changed together, so neither can be undone alone. That coupling is the real mistake.' },
  ],
  safe: [
    { lane: 'DB', title: 'Expand: ADD COLUMN full_name (nullable)', sql: 'ALTER TABLE users ADD COLUMN full_name text;', state: { 'name column': 'exists', 'full_name column': 'exists (empty)', 'old code': 'reads name', 'new code': 'not deployed' }, tone: 'good', note: 'Adding a nullable column is compatible with old code, which simply ignores it. Nothing breaks.' },
    { lane: 'B', title: 'Deploy: write to BOTH columns', sql: 'user.name = x; user.full_name = x', state: { 'name column': 'exists', 'full_name column': 'filling up', 'old code': 'reads name', 'new code': 'writes both, reads name' }, tone: 'good', note: 'New code keeps writing the old column, so old servers stay correct during the rollout. Both versions work at once.' },
    { lane: 'DB', title: 'Backfill old rows in small batches', sql: 'UPDATE users SET full_name = name WHERE id BETWEEN 1 AND 1000 AND full_name IS NULL;', state: { 'name column': 'exists', 'full_name column': 'complete', 'old code': 'reads name', 'new code': 'writes both, reads name' }, tone: 'good', note: 'Batches keep each transaction short, so locks are brief. One giant UPDATE would hold locks and bloat the table.' },
    { lane: 'B', title: 'Deploy: read from full_name', state: { 'name column': 'exists', 'full_name column': 'complete', 'old code': 'gone', 'new code': 'writes both, reads full_name' }, tone: 'good', note: 'Now the new column is the source of truth. You can still roll back one release safely, because the old column is still being written.' },
    { lane: 'B', title: 'Deploy: stop writing name', state: { 'name column': 'unused', 'full_name column': 'complete', 'old code': 'gone', 'new code': 'uses full_name only' }, tone: 'good', note: 'Wait until no running code touches name. Check the logs, do not guess.' },
    { lane: 'DB', title: 'Contract: DROP COLUMN name (a later release)', sql: 'ALTER TABLE users DROP COLUMN name;', state: { 'name column': 'dropped', 'full_name column': 'complete', 'old code': 'gone', 'new code': 'uses full_name only' }, tone: 'good', note: 'Done with zero errors. It took several small releases instead of one risky one, and that is the price of no downtime.' },
  ],
}

export default function MigrateViz() {
  const [mode, setMode] = useState<Mode>('naive')
  return (
    <div>
      <Predict
        question="You rename a column in one deploy while servers are being replaced one by one. What happens to requests handled by servers still running the old code?"
        options={['They keep working', 'They fail until they are replaced', 'The database rewrites the old queries']} answer={1}
        why="Old code asks for a column that no longer exists. A rolling deploy means old and new code coexist, so every schema change must work with both versions."
      />
      <div className="seg" role="group" aria-label="Migration style">
        <button className={mode === 'naive' ? 'on' : ''} onClick={() => setMode('naive')}>Rename in one step (breaks)</button>
        <button className={mode === 'safe' ? 'on' : ''} onClick={() => setMode('safe')}>Expand, backfill, contract (safe)</button>
      </div>
      <Timeline steps={STEPS[mode]} resetKey={mode} labels={{ A: 'Old code', DB: 'Database', B: 'New code' }} />
    </div>
  )
}
