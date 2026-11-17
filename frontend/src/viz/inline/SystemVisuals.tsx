import { useState } from 'react'
import { Timeline, type Step } from '../../components/Timeline'
import { DataTable } from '../../components/DataTable'
import { Walkthrough } from '../../components/Walkthrough'

/* ---------- MVCC: row versions ---------- */

const sees = (who: string, v: string) => <span key={who} className="chip">{who} sees <b>{v}</b></span>

export function MvccViz() {
  const cols = ['version', 'balance', 'created by (xmin)', 'deleted by (xmax)']
  return (
    <Walkthrough
      resetKey="mvcc"
      steps={[
        { title: 'A row has one version', note: 'PostgreSQL stores each version of a row with the transaction that created it (xmin) and, later, the one that replaced it (xmax).',
          body: <><DataTable title="accounts (id = 1)" cols={cols} rows={[{ id: 'v1', cells: ['v1', 100, 'T10', '—'], tone: 'good' }]} /><div className="statebar">{sees('everyone', 'v1 (100)')}</div></> },
        { title: 'A reader starts a transaction', note: 'The reader takes a snapshot: "I will see only what was committed before now". This is what makes reads consistent.',
          body: <><DataTable title="accounts (id = 1)" cols={cols} rows={[{ id: 'v1', cells: ['v1', 100, 'T10', '—'], tone: 'good' }]} /><div className="statebar">{sees('Reader (T20)', 'v1 (100)')}</div></> },
        { title: 'A writer updates the row', note: 'The row is not overwritten. A new version v2 is written and v1 is marked as replaced. Both exist on disk, so the reader is not disturbed and the writer does not wait for it.',
          body: <><DataTable title="accounts (id = 1)" cols={cols} rows={[{ id: 'v1', cells: ['v1', 100, 'T10', 'T21'], tone: 'wait' }, { id: 'v2', cells: ['v2', 50, 'T21', '—'], tone: 'changed' }]} /><div className="statebar">{sees('Reader (T20)', 'v1 (100)')}{sees('Writer (T21)', 'v2 (50), its own change')}</div></> },
        { title: 'The writer commits', note: 'New transactions now see v2. The old reader keeps its snapshot and still sees v1 (at Repeatable Read). Readers never block writers, writers never block readers.',
          body: <><DataTable title="accounts (id = 1)" cols={cols} rows={[{ id: 'v1', cells: ['v1', 100, 'T10', 'T21 ✓'], tone: 'wait' }, { id: 'v2', cells: ['v2', 50, 'T21 ✓', '—'], tone: 'good' }]} /><div className="statebar">{sees('Reader (T20)', 'v1 (100)')}{sees('New transaction', 'v2 (50)')}</div></> },
        { title: 'Cleanup: VACUUM removes dead versions', note: 'Once no open transaction can see v1, VACUUM reclaims it. A transaction left open for hours keeps old versions alive, and the table bloats. That is why long idle transactions hurt.',
          body: <><DataTable title="accounts (id = 1)" cols={cols} rows={[{ id: 'v2', cells: ['v2', 50, 'T21 ✓', '—'], tone: 'good' }]} /><div className="statebar">{sees('everyone', 'v2 (50)')}</div></> },
      ]}
    />
  )
}

/* ---------- Deadlock ---------- */

const DL: Record<'deadlock' | 'ordered', Step[]> = {
  deadlock: [
    { lane: 'A', title: 'A: UPDATE row 1', sql: 'UPDATE accounts SET … WHERE id = 1', state: { 'row 1': 'locked by A', 'row 2': 'free' }, note: 'A takes the lock on row 1.' },
    { lane: 'B', title: 'B: UPDATE row 2', sql: 'UPDATE accounts SET … WHERE id = 2', state: { 'row 1': 'locked by A', 'row 2': 'locked by B' }, note: 'B takes the lock on row 2.' },
    { lane: 'A', title: 'A: UPDATE row 2 …waits', sql: 'UPDATE accounts SET … WHERE id = 2', state: { 'row 1': 'locked by A', 'row 2': 'locked by B' }, tone: 'wait', note: 'A needs row 2, which B holds, so A waits for B.' },
    { lane: 'B', title: 'B: UPDATE row 1 …waits', sql: 'UPDATE accounts SET … WHERE id = 1', state: { 'row 1': 'locked by A', 'row 2': 'locked by B' }, tone: 'wait', note: 'B needs row 1, which A holds. A waits for B and B waits for A: a cycle. Neither can ever continue.' },
    { lane: 'DB', title: 'Deadlock detected', state: { 'row 1': 'locked by A', 'row 2': 'free (B aborted)' }, tone: 'bad', note: 'After deadlock_timeout (1 second by default) PostgreSQL finds the cycle and aborts one transaction: ERROR: deadlock detected.' },
    { lane: 'A', title: 'A continues and COMMITs', state: { 'row 1': 'free', 'row 2': 'free' }, tone: 'good', note: 'With B gone, A gets row 2 and finishes.' },
    { lane: 'B', title: 'B retries from the start', state: { 'row 1': 'free', 'row 2': 'free' }, tone: 'good', note: 'Your code must catch the error and retry the whole transaction.' },
  ],
  ordered: [
    { lane: 'A', title: 'A: UPDATE row 1', sql: 'UPDATE accounts SET … WHERE id = 1', state: { 'row 1': 'locked by A', 'row 2': 'free' }, note: 'Rule: everyone locks the lower id first.' },
    { lane: 'B', title: 'B: UPDATE row 1 …waits', sql: 'UPDATE accounts SET … WHERE id = 1', state: { 'row 1': 'locked by A', 'row 2': 'free' }, tone: 'wait', note: 'B follows the same order, so it waits at the first row. It holds nothing, so nobody waits on B.' },
    { lane: 'A', title: 'A: UPDATE row 2', sql: 'UPDATE accounts SET … WHERE id = 2', state: { 'row 1': 'locked by A', 'row 2': 'locked by A' }, note: 'Nothing blocks A.' },
    { lane: 'A', title: 'A: COMMIT', state: { 'row 1': 'free', 'row 2': 'free' }, tone: 'good', note: 'Both locks are released together.' },
    { lane: 'B', title: 'B: gets row 1, then row 2, COMMIT', state: { 'row 1': 'free', 'row 2': 'free' }, tone: 'good', note: 'No cycle is possible when everyone locks in the same order.' },
  ],
}

export function DeadlockViz() {
  const [k, setK] = useState<'deadlock' | 'ordered'>('deadlock')
  return (
    <div>
      <div className="seg" role="group" aria-label="Locking order">
        <button className={k === 'deadlock' ? 'on' : ''} onClick={() => setK('deadlock')}>Opposite order (deadlock)</button>
        <button className={k === 'ordered' ? 'on' : ''} onClick={() => setK('ordered')}>Same order (safe)</button>
      </div>
      <Timeline steps={DL[k]} resetKey={k} labels={{ A: 'Transaction A', B: 'Transaction B', DB: 'Database' }} />
    </div>
  )
}

/* ---------- Consistent hashing ring ---------- */

const COLORS = ['#4f8cff', '#34c28a', '#f5a524', '#e5607a']
const NODES = [{ n: 'A', a: 60 }, { n: 'B', a: 180 }, { n: 'C', a: 300 }, { n: 'D', a: 120 }]
const KEYS = [10, 35, 70, 95, 130, 150, 185, 215, 245, 270, 310, 340].map((a, i) => ({ k: `k${i + 1}`, a, h: [14, 7, 22, 9, 31, 18, 5, 26, 12, 29, 16, 3][i] }))

function ownerRing(angle: number, nodes: typeof NODES) {
  const sorted = [...nodes].sort((x, y) => x.a - y.a)
  return (sorted.find((n) => n.a >= angle) ?? sorted[0]).n
}
const pt = (a: number, r: number) => [110 + r * Math.sin((a * Math.PI) / 180), 110 - r * Math.cos((a * Math.PI) / 180)]

export function HashRingViz() {
  const [withD, setWithD] = useState(false)
  const nodes = withD ? NODES : NODES.slice(0, 3)
  const before = NODES.slice(0, 3)
  const movedRing = KEYS.filter((k) => ownerRing(k.a, before) !== ownerRing(k.a, nodes)).length
  const movedMod = KEYS.filter((k) => k.h % 3 !== k.h % nodes.length).length
  const idx = (n: string) => NODES.findIndex((x) => x.n === n)
  return (
    <div>
      <p className="muted small">Each key goes to the first server found clockwise from its position on the ring.</p>
      <svg viewBox="0 0 220 220" className="ring" role="img" aria-label="Consistent hashing ring">
        <circle cx="110" cy="110" r="85" fill="none" stroke="var(--line)" strokeWidth="2" />
        {KEYS.map((k) => { const [x, y] = pt(k.a, 85); return <circle key={k.k} cx={x} cy={y} r="5" fill={COLORS[idx(ownerRing(k.a, nodes))]} stroke="var(--bg)"><title>{k.k} → server {ownerRing(k.a, nodes)}</title></circle> })}
        {nodes.map((n) => { const [x, y] = pt(n.a, 85); return <g key={n.n}><rect x={x - 11} y={y - 11} width="22" height="22" rx="5" fill={COLORS[idx(n.n)]} /><text x={x} y={y + 4} textAnchor="middle" className="ringtext">{n.n}</text></g> })}
        <text x="110" y="106" textAnchor="middle" className="svgtext">{KEYS.length} keys</text>
        <text x="110" y="124" textAnchor="middle" className="svgtext">{nodes.length} servers</text>
      </svg>
      <div className="viz-row">
        <button className="primary" onClick={() => setWithD(!withD)}>{withD ? 'Remove server D' : 'Add server D'}</button>
      </div>
      <DataTable title="Keys that had to move" cols={['Method', 'Keys moved', 'of']}
        rows={[
          { id: 'ring', cells: ['Consistent hashing (ring)', movedRing, KEYS.length], tone: movedRing ? 'good' : undefined },
          { id: 'mod', cells: ['hash(key) mod N', movedMod, KEYS.length], tone: movedMod ? 'bad' : undefined },
        ]}
        note={withD ? 'The new server takes over only the keys between it and its neighbour. Modulo hashing reshuffles most keys, which would empty a cache or force a huge data migration.' : 'Press "Add server D" and compare how much data each method moves.'} />
    </div>
  )
}

/* ---------- Celery message flow ---------- */

const CELERY: Record<'normal' | 'crash', Step[]> = {
  normal: [
    { lane: 'A', title: 'POST /signup', state: { queue: '0', 'user row': 'not saved', 'emails sent': '0' }, note: 'A user signs up. The view saves the user, then must send a welcome email.' },
    { lane: 'A', title: 'COMMIT, then send_email.delay(7)', sql: 'transaction.on_commit(...)', state: { queue: '0', 'user row': 'saved', 'emails sent': '0' }, note: 'Enqueue only after COMMIT, so the worker can always find the row.' },
    { lane: 'DB', title: 'Message stored in the queue', state: { queue: '1', 'user row': 'saved', 'emails sent': '0' }, note: 'The broker (Redis or RabbitMQ) holds the message: task name plus arguments (an id, not an object).' },
    { lane: 'A', title: 'Respond 201 right away', state: { queue: '1', 'user row': 'saved', 'emails sent': '0' }, tone: 'good', note: 'The user is not kept waiting for the slow SMTP call. The web process is free for the next request.' },
    { lane: 'B', title: 'Worker takes the message', state: { queue: '0 (in flight)', 'user row': 'saved', 'emails sent': '0' }, note: 'Any free worker process may pick it up. Add workers to process more at once.' },
    { lane: 'B', title: 'Runs send_email(7), then ACKs', state: { queue: '0', 'user row': 'saved', 'emails sent': '1' }, tone: 'good', note: 'After the task finishes the worker acknowledges, and the broker forgets the message.' },
  ],
  crash: [
    { lane: 'A', title: 'COMMIT, then send_email.delay(7)', state: { queue: '1', 'emails sent': '0' }, note: 'Same start: the message is queued. This worker uses acks_late, so it acknowledges only after finishing.' },
    { lane: 'B', title: 'Worker takes the message', state: { queue: '0 (in flight, unacked)', 'emails sent': '0' }, note: 'The message is not deleted yet. The broker waits for an acknowledgement.' },
    { lane: 'B', title: 'Sends the email... then the worker is killed', state: { queue: '0 (in flight, unacked)', 'emails sent': '1' }, tone: 'bad', note: 'The email left, but the process died before it could ACK.' },
    { lane: 'DB', title: 'No ACK arrives: broker redelivers', state: { queue: '1 (redelivered)', 'emails sent': '1' }, tone: 'wait', note: 'The broker cannot know the task finished, so it assumes it failed and queues it again. This is at-least-once delivery.' },
    { lane: 'B', title: 'Another worker runs it again', state: { queue: '0', 'emails sent': '2' }, tone: 'bad', note: 'Without protection the customer gets two emails. For a payment this would be a double charge.' },
    { lane: 'B', title: 'Fix: make the task idempotent', sql: 'if user.welcome_sent: return', state: { queue: '0', 'emails sent': '1 (duplicate skipped)' }, tone: 'good', note: 'Check a "done" marker (or rely on a unique constraint) before acting, so running the same task twice has the same result as once.' },
  ],
}

export function CeleryFlowViz() {
  const [k, setK] = useState<'normal' | 'crash'>('normal')
  return (
    <div>
      <div className="seg" role="group" aria-label="Scenario">
        <button className={k === 'normal' ? 'on' : ''} onClick={() => setK('normal')}>Normal run</button>
        <button className={k === 'crash' ? 'on' : ''} onClick={() => setK('crash')}>Worker crashes mid-task</button>
      </div>
      <Timeline steps={CELERY[k]} resetKey={k} labels={{ A: 'Django web', DB: 'Broker (queue)', B: 'Celery worker' }} />
    </div>
  )
}

/* ---------- WAL and crash recovery ---------- */

const WAL: Record<'after' | 'before', Step[]> = {
  after: [
    { lane: 'A', title: 'UPDATE balance = 50', sql: 'UPDATE accounts SET balance = 50 WHERE id = 1', state: { 'memory page': 'balance 50', 'WAL on disk': 'empty', 'data file': 'balance 100' }, note: 'The change is made to a page in memory. The data file on disk still says 100.' },
    { lane: 'DB', title: 'Change record appended to the WAL', state: { 'memory page': 'balance 50', 'WAL on disk': 'buffered…', 'data file': 'balance 100' }, note: 'Before anything else, the database writes "balance 100 → 50" to its write-ahead log. Appending to one log is fast and sequential.' },
    { lane: 'A', title: 'COMMIT', state: { 'memory page': 'balance 50', 'WAL on disk': 'buffered…', 'data file': 'balance 100' }, note: 'The app asks to make it permanent.' },
    { lane: 'DB', title: 'WAL flushed to disk (fsync)', state: { 'memory page': 'balance 50', 'WAL on disk': 'UPDATE 100→50 ✓', 'data file': 'balance 100' }, tone: 'good', note: 'Only now does the database answer "COMMIT OK". The promise of durability rests on this one flush.' },
    { lane: 'DB', title: 'Crash! Power is lost', state: { 'memory page': 'lost', 'WAL on disk': 'UPDATE 100→50 ✓', 'data file': 'balance 100 (stale)' }, tone: 'bad', note: 'Memory is wiped and the data file never received the change. Without the WAL this committed update would be lost.' },
    { lane: 'DB', title: 'Restart: replay the WAL', state: { 'memory page': 'rebuilt', 'WAL on disk': 'replayed ✓', 'data file': 'balance 50' }, tone: 'good', note: 'Recovery re-applies every committed record from the log. The committed change survived. That is Durability.' },
  ],
  before: [
    { lane: 'A', title: 'UPDATE balance = 50', sql: 'UPDATE accounts SET balance = 50 WHERE id = 1', state: { 'memory page': 'balance 50', 'WAL on disk': 'empty', 'data file': 'balance 100' }, note: 'Same start. Nothing has been committed.' },
    { lane: 'DB', title: 'Change record in the WAL buffer', state: { 'memory page': 'balance 50', 'WAL on disk': 'buffered…', 'data file': 'balance 100' }, note: 'The record is only in memory, with no commit marker yet.' },
    { lane: 'DB', title: 'Crash before COMMIT', state: { 'memory page': 'lost', 'WAL on disk': 'no commit record', 'data file': 'balance 100' }, tone: 'bad', note: 'The server dies mid-transaction.' },
    { lane: 'DB', title: 'Restart: nothing to replay', state: { 'memory page': 'rebuilt', 'WAL on disk': 'ignored', 'data file': 'balance 100' }, tone: 'good', note: 'Without a commit record the change is discarded. The half-finished transaction vanishes completely. That is Atomicity.' },
  ],
}

export function WalViz() {
  const [k, setK] = useState<'after' | 'before'>('after')
  return (
    <div>
      <div className="seg" role="group" aria-label="When the crash happens">
        <button className={k === 'after' ? 'on' : ''} onClick={() => setK('after')}>Crash after COMMIT</button>
        <button className={k === 'before' ? 'on' : ''} onClick={() => setK('before')}>Crash before COMMIT</button>
      </div>
      <Timeline steps={WAL[k]} resetKey={k} lanes={['A', 'DB']} labels={{ A: 'Application', DB: 'Database' }} />
    </div>
  )
}

/* ---------- Cache-aside flows ---------- */

const CA: Record<'miss' | 'hit' | 'write', Step[]> = {
  miss: [
    { lane: 'A', title: 'GET product:7', state: { cache: 'empty', 'DB queries': '0' }, note: 'The app always asks the cache first.' },
    { lane: 'DB', title: 'MISS', state: { cache: 'empty', 'DB queries': '0' }, tone: 'wait', note: 'Nothing stored under that key yet.' },
    { lane: 'B', title: 'SELECT … WHERE id = 7', state: { cache: 'empty', 'DB queries': '1' }, note: 'The app reads the source of truth.' },
    { lane: 'A', title: 'SET product:7 (TTL 60 s)', state: { cache: 'product:7 = v1 (60 s)', 'DB queries': '1' }, tone: 'good', note: 'It stores the answer with an expiry so a mistake cannot live forever.' },
  ],
  hit: [
    { lane: 'A', title: 'GET product:7', state: { cache: 'product:7 = v1', 'DB queries': '0' }, note: 'A later request for the same product.' },
    { lane: 'DB', title: 'HIT: returns v1', state: { cache: 'product:7 = v1', 'DB queries': '0' }, tone: 'good', note: 'Served from memory in well under a millisecond. The database is not touched, which is the whole point.' },
  ],
  write: [
    { lane: 'B', title: 'UPDATE product 7 (price → v2), COMMIT', state: { cache: 'product:7 = v1 (stale!)', database: 'v2' }, tone: 'bad', note: 'The database now holds v2, but the cache still holds the old v1.' },
    { lane: 'A', title: 'DEL product:7 (after commit)', state: { cache: 'empty', database: 'v2' }, tone: 'good', note: 'Delete, do not update, the cache entry. Delete from transaction.on_commit() so you never invalidate before the new data is visible.' },
    { lane: 'A', title: 'Next GET product:7 → MISS', state: { cache: 'empty', database: 'v2' }, tone: 'wait', note: 'The next reader finds nothing in the cache.' },
    { lane: 'B', title: 'Reload v2 and SET', state: { cache: 'product:7 = v2', database: 'v2' }, tone: 'good', note: 'The cache is rebuilt from fresh data. The TTL still protects you if a delete is ever missed.' },
  ],
}

export function CacheAsideViz() {
  const [k, setK] = useState<'miss' | 'hit' | 'write'>('miss')
  return (
    <div>
      <div className="seg" role="group" aria-label="Scenario">
        <button className={k === 'miss' ? 'on' : ''} onClick={() => setK('miss')}>Read: cache miss</button>
        <button className={k === 'hit' ? 'on' : ''} onClick={() => setK('hit')}>Read: cache hit</button>
        <button className={k === 'write' ? 'on' : ''} onClick={() => setK('write')}>Write: invalidate</button>
      </div>
      <Timeline steps={CA[k]} resetKey={k} labels={{ A: 'App', DB: 'Cache (Redis)', B: 'Database' }} />
    </div>
  )
}
