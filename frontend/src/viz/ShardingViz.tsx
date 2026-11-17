import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Predict } from '../components/Predict'

type Strategy = 'hash' | 'time' | 'tenant'
const KEYS = 2000

function fnv(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}

function ringOwner(n: number, vnodes = 100) {
  const ring: { p: number; s: number }[] = []
  for (let s = 0; s < n; s++) for (let v = 0; v < vnodes; v++) ring.push({ p: fnv(`shard-${s}-${v}`), s })
  ring.sort((a, b) => a.p - b.p)
  return (key: string) => {
    const h = fnv(key)
    return (ring.find((r) => r.p >= h) ?? ring[0]).s
  }
}

/** Deterministic distribution of 2000 writes across n shards for each strategy. */
function distribution(strategy: Strategy, n: number) {
  const counts = Array<number>(n).fill(0)
  for (let id = 1; id <= KEYS; id++) {
    if (strategy === 'hash') counts[fnv(String(id)) % n]++
    else if (strategy === 'time') counts[n - 1]++                       // every NEW order lands in the newest range
    else {
      // 50 tenants, Zipf-like: tenant 1 is ~22% of traffic, tenant 2 ~11%…
      const r = (fnv(`t${id}`) % 10000) / 10000
      let tenant = 1, acc = 0, norm = 0
      for (let k = 1; k <= 50; k++) norm += 1 / k
      for (let k = 1; k <= 50; k++) { acc += 1 / k / norm; if (r <= acc) { tenant = k; break } }
      counts[tenant % n]++
    }
  }
  return counts
}

export default function ShardingViz() {
  const [strategy, setStrategy] = useState<Strategy>('hash')
  const [shards, setShards] = useState(4)

  const counts = useMemo(() => distribution(strategy, shards), [strategy, shards])
  const avg = KEYS / shards
  const max = Math.max(...counts)

  const moved = useMemo(() => {
    const owner = ringOwner(shards), owner2 = ringOwner(shards + 1)
    let mod = 0, ring = 0
    for (let id = 1; id <= KEYS; id++) {
      const k = String(id)
      if (fnv(k) % shards !== fnv(k) % (shards + 1)) mod++
      if (owner(k) !== owner2(k)) ring++
    }
    return { mod: Math.round((mod / KEYS) * 100), ring: Math.round((ring / KEYS) * 100) }
  }, [shards])

  const text: Record<Strategy, string> = {
    hash: 'Hash of customer_id: even spread, and a customer’s orders stay together. Cross-customer reports must hit every shard.',
    time: 'Range on created_at: great for archiving, terrible for writes. Every new order hits the newest shard — a permanent hotspot.',
    tenant: 'tenant_id with a few huge tenants: reads stay local, but one big tenant overloads its shard. You need to split or isolate it.',
  }

  return (
    <div>
      <Predict
        question="You shard orders by created_at month so each shard holds one month. Which shard takes ALL the write traffic?"
        options={['They share it evenly', 'The newest month’s shard']} answer={1}
        why="New orders always have the newest timestamp. Pick the strategy below and watch the bars."
      />

      <div className="seg" role="group" aria-label="Shard key">
        <button className={strategy === 'hash' ? 'on' : ''} onClick={() => setStrategy('hash')}>hash(customer_id)</button>
        <button className={strategy === 'time' ? 'on' : ''} onClick={() => setStrategy('time')}>created_at range</button>
        <button className={strategy === 'tenant' ? 'on' : ''} onClick={() => setStrategy('tenant')}>tenant_id (skewed)</button>
      </div>

      <label className="field">Shards <input type="range" min={2} max={8} value={shards} onChange={(e) => setShards(+e.target.value)} /> <b>{shards}</b></label>

      <div className="bars" role="img" aria-label="Writes per shard">
        {counts.map((c, i) => {
          const hot = c > avg * 1.5
          return (
            <div key={i} className="bar-col">
              <span className="bar-val">{c}</span>
              <motion.div className={`bar ${hot ? 'hot' : ''}`} animate={{ height: `${(c / Math.max(max, 1)) * 140 + 2}px` }} transition={{ type: 'spring', stiffness: 120, damping: 18 }} />
              <span className="bar-label">shard {i}</span>
            </div>
          )
        })}
      </div>
      <p className={`note ${counts.some((c) => c > avg * 1.5) ? 'bad' : 'good'}`}>{text[strategy]}</p>

      <div className="panel">
        <h4>Break it: add one shard ({shards} → {shards + 1})</h4>
        <div className="compare">
          <div><b>{moved.mod}%</b><span>keys move with <code>hash % N</code></span></div>
          <div><b>{moved.ring}%</b><span>keys move with consistent hashing</span></div>
        </div>
        <p className="muted small">Modulo reshuffles almost everything (a mass data migration). A hash ring moves only about 1/(N+1) of keys — the reason real systems use it.</p>
      </div>
    </div>
  )
}
