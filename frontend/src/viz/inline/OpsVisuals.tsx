import { useState } from 'react'
import { Walkthrough } from '../../components/Walkthrough'
import { DataTable } from '../../components/DataTable'

/* ---------- The answer structure, applied to a URL shortener ---------- */

const list = (items: string[]) => <ul className="lesson-list">{items.map((i) => <li key={i}>{i}</li>)}</ul>

export function SdFramework() {
  return (
    <Walkthrough
      resetKey="sdframework"
      steps={[
        {
          title: 'Clarify requirements',
          note: 'Spend the first minutes here. Ask, do not assume. Interviewers expect the candidate to drive this at mid level.',
          body: list(['Functional: create a short link, redirect to the long URL, optional expiry and custom alias.', 'Non-functional: redirects must be fast (read-heavy), links must never break, high availability.', 'Out of scope (say it): analytics dashboards, abuse detection.']),
        },
        {
          title: 'Estimate the load',
          note: 'Per-second numbers are small. 100 million new links a month is only about 40 writes per second. That tells you one primary is a fine start.',
          body: (
            <DataTable title="Assumption: 100M new links / month, reads 100x writes" cols={['Quantity', 'Value']}
              rows={[
                { id: 1, cells: ['Writes / s (avg)', '100M / 2.6M s ≈ 40'], tone: 'good' },
                { id: 2, cells: ['Reads / s (avg)', '40 x 100 ≈ 4,000'], tone: 'wait' },
                { id: 3, cells: ['Storage, 5 years', '6B rows x 500 B ≈ 3 TB'], tone: 'wait' },
              ]} />
          ),
        },
        {
          title: 'API and data model',
          note: 'Keep the schema tiny. The short code is the primary key, so a redirect is a single primary-key lookup.',
          body: (
            <>
              <DataTable title="urls" cols={['code (PK)', 'long_url', 'user_id (FK, nullable)', 'created_at', 'expires_at']} rows={[{ id: 1, cells: ['aZ3kQ9x', 'https://example.com/very/long/path', 7, '2026-01-02', null] }]} />
              {list(['POST /links  →  { code }', 'GET /{code}  →  301 or 302 redirect'])}
            </>
          ),
        },
        {
          title: 'Choose storage and generate codes',
          note: '7 base-62 characters give 62^7 ≈ 3.5 trillion codes, plenty for 6 billion links. The hard part is generating unique codes without a collision check on every write.',
          body: list(['Storage: relational is fine at this size. A key-value store also fits, because access is by key only.', 'Code generation option A: random 7 chars, insert, retry on a unique-constraint collision.', 'Option B: a counter or ID generator, then base-62 encode it. No collisions, but codes are guessable unless shuffled.']),
        },
        {
          title: 'Find the bottleneck and scale it',
          note: 'Name the bottleneck first, then fix only that. Here it is reads, so the answer is a cache, not sharding.',
          body: list(['Reads (4,000/s, hot links repeat): cache code → URL in Redis, high hit rate.', 'Availability: read replicas and a standby primary.', 'Storage (3 TB): fine for one server with partitioning and archiving expired links. Shard only if estimates grow 10x.']),
        },
        {
          title: 'State trade-offs and failure modes',
          note: 'At senior level this is where you earn credit: go deep in one or two places and flag the limits of your own design.',
          body: list(['301 (cached by browsers, fewer hits, cannot change later) vs 302 (every click reaches you, enables analytics).', 'Cache stale after a link is deleted: short TTL or delete the key on change.', 'Hot key (a viral link): local in-process cache in front of Redis.', 'Single primary is a write bottleneck and a failure point: describe failover and what you lose (async replication lag).']),
        },
      ]}
    />
  )
}

/* ---------- Connection pool exhaustion ---------- */

const MAX_CONN = 100 // PostgreSQL default max_connections
const PER_INSTANCE = 16 // e.g. 4 Gunicorn workers x 4 threads, each holding one connection
const POOL_SIZE = 40

export function PoolViz() {
  const [instances, setInstances] = useState(3)
  const [pooled, setPooled] = useState(false)
  const demand = instances * PER_INSTANCE
  const dbConns = pooled ? Math.min(demand, POOL_SIZE) : demand
  const failing = !pooled && demand > MAX_CONN
  const queued = pooled ? Math.max(0, demand - POOL_SIZE) : 0
  const pct = Math.min(100, (dbConns / MAX_CONN) * 100)
  return (
    <div>
      <div className="seg" role="group" aria-label="Connection strategy">
        <button className={!pooled ? 'on' : ''} onClick={() => setPooled(false)}>Every thread opens its own connection</button>
        <button className={pooled ? 'on' : ''} onClick={() => setPooled(true)}>Shared pool (PgBouncer or Django pool)</button>
      </div>
      <label className="logslider">
        <span>App instances: <b>{instances}</b> <span className="muted small">(each with {PER_INSTANCE} threads that may hold a connection)</span></span>
        <input type="range" min={1} max={12} step={1} value={instances} aria-label="App instances" onChange={(e) => setInstances(Number(e.target.value))} />
      </label>
      <div className="poolbar" aria-label="Database connections used">
        <div className={`poolfill ${failing ? 'bad' : pct > 70 ? 'wait' : 'good'}`} style={{ width: `${pct}%` }} />
        <span className="poollabel">{dbConns} of {MAX_CONN} database connections</span>
      </div>
      <p className={`note ${failing ? 'bad' : 'good'}`} role="status">
        {failing
          ? `Demand is ${demand} connections but PostgreSQL allows ${MAX_CONN}. New requests fail with: FATAL: sorry, too many clients already.`
          : pooled
            ? `${demand} clients share ${dbConns} real connections${queued ? `; ${queued} wait briefly in the pool's queue instead of failing` : ''}.`
            : `${demand} of ${MAX_CONN} connections used. Adding instances will eventually run out.`}
      </p>
      <p className="muted small">Each connection is a separate server process using memory, so more connections is not faster. The default PostgreSQL limit is 100. Django's docs say your database must allow at least as many connections as you have worker threads. Pooling lets many app threads share few connections.</p>
    </div>
  )
}
