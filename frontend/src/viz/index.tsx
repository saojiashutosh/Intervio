import { lazy, Suspense } from 'react'
import type { VizId } from '../types'

const registry = {
  index: lazy(() => import('./IndexViz')),
  isolation: lazy(() => import('./IsolationViz')),
  lock: lazy(() => import('./LockViz')),
  replication: lazy(() => import('./ReplicationViz')),
  sharding: lazy(() => import('./ShardingViz')),
  nplus1: lazy(() => import('./NPlusOneViz')),
  oncommit: lazy(() => import('./OnCommitViz')),
  er: lazy(() => import('./ErViz')),
  fk: lazy(() => import('./FkViz')),
  normalize: lazy(() => import('./NormalizeViz')),
  denorm: lazy(() => import('./DenormViz')),
  types: lazy(() => import('./TypesViz')),
  constraints: lazy(() => import('./ConstraintsViz')),
  sqlnosql: lazy(() => import('./SqlNoSqlViz')),
  plan: lazy(() => import('./PlanViz')),
  atomic: lazy(() => import('./AtomicViz')),
  cache: lazy(() => import('./CacheViz')),
  pagination: lazy(() => import('./PaginationViz')),
  security: lazy(() => import('./SecurityViz')),
} satisfies Record<VizId, unknown>

const titles: Record<VizId, string> = {
  index: 'See how an index finds a row',
  isolation: 'Two sessions, one row: what does each see?',
  lock: 'The last unit: why overselling happens',
  replication: 'Replication lag and failover',
  sharding: 'Pick a shard key, watch the load',
  nplus1: 'N+1 queries: count them, then fix them',
  oncommit: 'Celery and the commit race',
  er: 'From relationships to tables',
  fk: 'What a foreign key protects you from',
  normalize: 'One fact, one place: anomalies and the normal forms',
  denorm: 'Why invoices store a price snapshot',
  types: 'Floats, time zones and NULL: the traps',
  constraints: 'Try to put bad data in',
  sqlnosql: 'Pick the right store',
  plan: 'Read a query plan, leaves first',
  atomic: 'All or nothing: transactions in action',
  cache: 'Stale cache: the invalidation race',
  pagination: 'Offset vs cursor: watch rows move',
  security: 'Attack it, then fix it',
}

export function Visualizer({ id }: { id: VizId }) {
  const V = registry[id]
  return (
    <section className="viz card" aria-label={titles[id]}>
      <h3><span className="tag">Interactive</span> {titles[id]}</h3>
      <Suspense fallback={<p className="muted">Loading animation…</p>}><V /></Suspense>
    </section>
  )
}
