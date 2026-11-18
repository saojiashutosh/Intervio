import { lazy, Suspense } from 'react'
import type { Scene, StageScene, VizId } from '../types'

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
  sysdesign: lazy(() => import('./SysDesignViz')),
  migrate: lazy(() => import('./MigrateViz')),
  bigo: lazy(() => import('./BigOViz')),
  algo: lazy(() => import('./AlgoViz')),
} satisfies Record<Exclude<VizId, 'scenes' | 'stage'>, unknown>

const Scenes = lazy(() => import('./ScenesViz'))
const Stage = lazy(() => import('./StageViz'))

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
  sysdesign: 'Estimate the load, then pick the architecture',
  migrate: 'Change a live schema without downtime',
  bigo: 'Feel how fast each complexity class grows',
  algo: 'Watch the algorithm patterns run',
  scenes: 'Step through it',
  stage: 'Watch the system, one step at a time',
}

export function Visualizer({ id, scenes = [] }: { id: VizId; scenes?: Scene[] | StageScene[] }) {
  return (
    <section className="viz card" aria-label={titles[id]}>
      <h3><span className="tag">Interactive</span> {titles[id]}</h3>
      <Suspense fallback={<p className="muted">Loading animation…</p>}>
        {id === 'stage' ? <Stage scenes={scenes as StageScene[]} /> : id === 'scenes' ? <Scenes scenes={scenes as Scene[]} /> : (() => { const V = registry[id]; return <V /> })()}
      </Suspense>
    </section>
  )
}
