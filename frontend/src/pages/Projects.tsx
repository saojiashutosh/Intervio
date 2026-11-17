import { useContent, useProgress } from '../context'

const FRAMEWORK = [
  'Clarify requirements: entities, read/write paths, consistency, latency, availability, retention, tenancy',
  'Estimate scale: requests/sec, read/write ratio, rows/day, storage growth, peak-to-average, connections',
  'Model data: entities, keys, constraints, indexes, partition keys, hot access paths',
  'Choose architecture: primary, replicas, cache, queues; partition/shard only when justified',
  'Walk critical flows: checkout, payment, inventory, retries, failover, read-after-write',
  'Cover operations: migrations, backups, PITR, monitoring, capacity, security, disaster recovery',
  'State trade-offs and evolve in phases — never start with sharding',
]

export default function ProjectsPage() {
  const { content } = useContent()
  const { isDone, toggle } = useProgress()
  if (!content) return null
  return (
    <>
      <h1>Projects</h1>
      <p className="lead">One project per level. These are your portfolio evidence: reproducible SQL, query plans, concurrency tests and clear trade-offs.</p>
      {content.levels.map((lv) => (
        <section key={lv.level} className="card project">
          <p className="eyebrow">Level {lv.level} · {lv.weeks}</p>
          <h2>{lv.project}</h2>
          <h4>What to build</h4>
          <ul>{lv.project_goals.map((g) => <li key={g}>{g}</li>)}</ul>
          <h4>Acceptance criteria</h4>
          <ul className="days">
            {lv.acceptance.map((a, i) => {
              const k = `project:${lv.level}:${i}`
              return <li key={k}><label className={isDone(k) ? 'done' : ''}><input type="checkbox" checked={isDone(k)} onChange={() => toggle(k)} /><span>{a}</span></label></li>
            })}
          </ul>
        </section>
      ))}
      <section className="card project">
        <h2>System-design answer framework</h2>
        <ol>{FRAMEWORK.map((f) => <li key={f}>{f}</li>)}</ol>
      </section>
    </>
  )
}
