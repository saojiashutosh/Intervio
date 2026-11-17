import { lazy, Suspense } from 'react'

/** Small visuals embedded inside the reading text with an `@viz:<id>` line. */
const registry = {
  'er-anatomy': lazy(() => import('./ErVisuals').then((m) => ({ default: m.ErAnatomy }))),
  'er-notation': lazy(() => import('./ErVisuals').then((m) => ({ default: m.ErNotation }))),
  'er-design': lazy(() => import('./ErVisuals').then((m) => ({ default: m.ErDesign }))),
  'fk-side': lazy(() => import('./ErVisuals').then((m) => ({ default: m.FkSide }))),
  joins: lazy(() => import('./DataVisuals').then((m) => ({ default: m.JoinsViz }))),
  decompose: lazy(() => import('./DataVisuals').then((m) => ({ default: m.DecomposeViz }))),
  'composite-index': lazy(() => import('./DataVisuals').then((m) => ({ default: m.CompositeIndexViz }))),
  mvcc: lazy(() => import('./SystemVisuals').then((m) => ({ default: m.MvccViz }))),
  deadlock: lazy(() => import('./SystemVisuals').then((m) => ({ default: m.DeadlockViz }))),
  hashring: lazy(() => import('./SystemVisuals').then((m) => ({ default: m.HashRingViz }))),
  'celery-flow': lazy(() => import('./SystemVisuals').then((m) => ({ default: m.CeleryFlowViz }))),
  wal: lazy(() => import('./SystemVisuals').then((m) => ({ default: m.WalViz }))),
  'cache-aside': lazy(() => import('./SystemVisuals').then((m) => ({ default: m.CacheAsideViz }))),
}

export type InlineId = keyof typeof registry

export const INLINE_TITLES: Record<InlineId, string> = {
  'er-anatomy': 'What each part of an ER drawing becomes',
  'er-notation': "Read crow's-foot notation",
  'er-design': 'Design a schema step by step',
  'fk-side': 'Where does the foreign key go?',
  joins: 'See which rows each JOIN keeps',
  decompose: 'Normalize a flat table, step by step',
  'composite-index': 'The leftmost-prefix rule',
  mvcc: 'MVCC: how readers and writers avoid each other',
  deadlock: 'How a deadlock forms, and how ordering prevents it',
  hashring: 'Consistent hashing: add a server',
  'celery-flow': 'What happens to a Celery task',
  wal: 'Crash recovery with the write-ahead log',
  'cache-aside': 'Cache-aside: hit, miss and invalidation',
}

export const isInlineId = (id: string): id is InlineId => id in registry

export function InlineViz({ id }: { id: InlineId }) {
  const V = registry[id]
  return (
    <figure className="inline-viz card" aria-label={INLINE_TITLES[id]}>
      <figcaption><span className="tag">Visual</span> {INLINE_TITLES[id]}</figcaption>
      <Suspense fallback={<p className="muted">Loading visual…</p>}><V /></Suspense>
    </figure>
  )
}
