import { useState } from 'react'
import { Predict } from '../components/Predict'
import { DataTable } from '../components/DataTable'

/** Rule-of-thumb limits used to decide what the numbers justify. They are my judgment, not a standard: real limits depend on hardware and queries, so always benchmark. */
const LIMITS = { cacheReads: 2000, replicaReads: 5000, shardWrites: 5000, partitionTB: 1, shardTB: 10, peak: 3, overhead: 2 }

const PRESETS = [
  { name: 'Small SaaS / blog', dau: 20_000, reads: 30, writes: 1, bytes: 1000 },
  { name: 'URL shortener', dau: 5_000_000, reads: 20, writes: 0.2, bytes: 500 },
  { name: 'Chat app', dau: 10_000_000, reads: 200, writes: 40, bytes: 300 },
  { name: 'Ride-hailing pings', dau: 2_000_000, reads: 50, writes: 500, bytes: 100 },
]

const fmt = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n >= 10 ? n.toFixed(0) : n.toFixed(1))
const fmtBytes = (b: number) => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(0)} GB` : `${(b / 1e6).toFixed(0)} MB`)

/** A slider on a log scale, so one control can span 1 to 100 million. */
function LogSlider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="logslider">
      <span>{label}: <b>{fmt(value)}</b></span>
      <input type="range" min={Math.log10(min)} max={Math.log10(max)} step={0.05} value={Math.log10(value)} aria-label={label}
        onChange={(e) => onChange(Number((10 ** Number(e.target.value)).toPrecision(2)))} />
    </label>
  )
}

export default function SysDesignViz() {
  const [p, setP] = useState(PRESETS[1])
  const set = (patch: Partial<typeof p>) => setP((x) => ({ ...x, ...patch }))

  const avgW = (p.dau * p.writes) / 86400
  const avgR = (p.dau * p.reads) / 86400
  const peakW = avgW * LIMITS.peak
  const peakR = avgR * LIMITS.peak
  const storageYear = p.dau * p.writes * 365 * p.bytes * LIMITS.overhead
  const tb = storageYear / 1e12

  const needCache = peakR > LIMITS.cacheReads
  const replicas = Math.max(1, Math.ceil(peakR / LIMITS.replicaReads))
  const needPartition = tb > LIMITS.partitionTB
  const needShard = peakW > LIMITS.shardWrites || tb > LIMITS.shardTB
  const reasons: string[] = []
  if (peakW > LIMITS.shardWrites) reasons.push(`peak writes ${fmt(peakW)}/s are above ~${fmt(LIMITS.shardWrites)}/s`)
  if (tb > LIMITS.shardTB) reasons.push(`${tb.toFixed(1)} TB per year is above ~${LIMITS.shardTB} TB`)

  const boxes: { name: string; on: boolean; why: string }[] = [
    { name: 'App servers', on: true, why: 'Stateless, scale by adding more.' },
    { name: 'Cache (Redis)', on: needCache, why: needCache ? `Peak reads ${fmt(peakR)}/s exceed ~${fmt(LIMITS.cacheReads)}/s.` : 'Reads are low enough for the database.' },
    { name: 'Primary database', on: true, why: 'All writes go here.' },
    { name: `Read replicas x${replicas}`, on: true, why: replicas > 1 ? `About one replica per ${fmt(LIMITS.replicaReads)} peak reads/s.` : 'One replica for failover and reporting.' },
    { name: 'Partition / archive', on: needPartition, why: needPartition ? `${tb.toFixed(1)} TB/yr: partition by time and archive old data.` : 'Storage is small.' },
    { name: 'Sharding', on: needShard, why: needShard ? `Because ${reasons.join(' and ')}.` : 'One primary can handle the writes. Do not shard yet.' },
  ]

  return (
    <div>
      <Predict
        question="1 million daily users each do 1 write per day. Roughly how many writes per second is that on average?"
        options={['About 12', 'About 1,200', 'About 120,000']} answer={0}
        why="1,000,000 writes spread over 86,400 seconds is about 12 per second. Daily numbers look huge, but per-second numbers are usually small. Estimating this first stops you from over-engineering."
      />
      <div className="seg" role="group" aria-label="Example system">
        {PRESETS.map((x) => <button key={x.name} className={p.name === x.name ? 'on' : ''} onClick={() => setP(x)}>{x.name}</button>)}
      </div>
      <div className="sliders">
        <LogSlider label="Daily active users" value={p.dau} min={1e3} max={1e8} onChange={(v) => set({ dau: v, name: 'Custom' })} />
        <LogSlider label="Reads per user per day" value={p.reads} min={1} max={1000} onChange={(v) => set({ reads: v, name: 'Custom' })} />
        <LogSlider label="Writes per user per day" value={p.writes} min={0.1} max={1000} onChange={(v) => set({ writes: v, name: 'Custom' })} />
        <LogSlider label="Bytes per record" value={p.bytes} min={50} max={10000} onChange={(v) => set({ bytes: v, name: 'Custom' })} />
      </div>
      <DataTable title="Back-of-envelope numbers" cols={['Quantity', 'Value', 'How']}
        rows={[
          { id: 1, cells: ['Average writes / s', fmt(avgW), 'users x writes / 86,400'] },
          { id: 2, cells: ['Peak writes / s', fmt(peakW), `average x ${LIMITS.peak} (peak factor)`], tone: peakW > LIMITS.shardWrites ? 'bad' : 'good' },
          { id: 3, cells: ['Average reads / s', fmt(avgR), 'users x reads / 86,400'] },
          { id: 4, cells: ['Peak reads / s', fmt(peakR), `average x ${LIMITS.peak}`], tone: peakR > LIMITS.cacheReads ? 'wait' : 'good' },
          { id: 5, cells: ['Storage per year', fmtBytes(storageYear), `writes x 365 x bytes x ${LIMITS.overhead} (indexes, overhead)`], tone: tb > LIMITS.partitionTB ? 'wait' : 'good' },
        ]}
      />
      <h4>What the numbers justify</h4>
      <div className="archrow" aria-label="Suggested architecture">
        {boxes.map((b) => (
          <div key={b.name} className={`archbox ${b.on ? 'on' : 'off'}`}>
            <b>{b.name}</b>
            <span>{b.on ? 'needed' : 'not yet'}</span>
            <small>{b.why}</small>
          </div>
        ))}
      </div>
      <p className="muted small">The limits behind these verdicts (about {fmt(LIMITS.cacheReads)} reads/s before a cache, {fmt(LIMITS.shardWrites)} writes/s before sharding, {LIMITS.partitionTB} TB before partitioning, {LIMITS.shardTB} TB before sharding) are my rough rules of thumb, not a standard. A tuned PostgreSQL server can do much more or much less depending on hardware and query shape. In an interview, state your assumption out loud, then say you would benchmark.</p>
    </div>
  )
}
