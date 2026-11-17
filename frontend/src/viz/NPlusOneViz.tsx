import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Predict } from '../components/Predict'

type Mode = 'lazy' | 'select' | 'prefetch'

function queriesFor(mode: Mode, n: number): string[] {
  const ids = Array.from({ length: n }, (_, i) => i + 1)
  if (mode === 'lazy') {
    return [`SELECT id, customer_id FROM orders LIMIT ${n};`, ...ids.map((i) => `SELECT full_name FROM customers WHERE id = ${i};   -- o.customer.full_name`)]
  }
  if (mode === 'select') {
    return [`SELECT o.id, o.customer_id, c.full_name FROM orders o JOIN customers c ON c.id = o.customer_id LIMIT ${n};`]
  }
  return [
    `SELECT id, customer_id FROM orders LIMIT ${n};`,
    `SELECT order_id, product_id, quantity FROM order_items WHERE order_id IN (${n > 6 ? ids.slice(0, 5).join(', ') + ', …' : ids.join(', ')});`,
  ]
}

const CODE: Record<Mode, string> = {
  lazy: 'for o in Order.objects.all()[:N]:\n    print(o.customer.full_name)',
  select: 'for o in Order.objects.select_related("customer")[:N]:\n    print(o.customer.full_name)',
  prefetch: 'for o in Order.objects.prefetch_related("items")[:N]:\n    print(len(o.items.all()))',
}

export default function NPlusOneViz() {
  const [mode, setMode] = useState<Mode>('lazy')
  const [n, setN] = useState(10)
  const [rtt, setRtt] = useState(2)
  const [tick, setTick] = useState(0)
  const [running, setRunning] = useState(false)

  const log = useMemo(() => queriesFor(mode, n), [mode, n])
  useEffect(() => { setTick(0); setRunning(false) }, [mode, n])
  useEffect(() => {
    if (!running) return
    if (tick >= log.length) { setRunning(false); return }
    const t = setTimeout(() => setTick((x) => x + 1), Math.max(60, 600 / Math.max(1, log.length / 6)))
    return () => clearTimeout(t)
  }, [running, tick, log.length])

  const shown = log.slice(0, tick)
  const total = log.length

  return (
    <div>
      <Predict
        question="A page lists 20 orders and prints o.customer.full_name for each one, with no select_related. How many SQL queries run?"
        options={['1', '2', '21']} answer={2}
        why="One query for the orders, then one lazy query per order for its customer: 1 + N. Switch to select_related below and watch it collapse to a single JOIN."
      />

      <div className="seg" role="group" aria-label="Loading strategy">
        <button className={mode === 'lazy' ? 'on' : ''} onClick={() => setMode('lazy')}>⚠ Lazy (default)</button>
        <button className={mode === 'select' ? 'on' : ''} onClick={() => setMode('select')}>select_related</button>
        <button className={mode === 'prefetch' ? 'on' : ''} onClick={() => setMode('prefetch')}>prefetch_related</button>
      </div>

      <pre className="codebox">{CODE[mode].replace('N', String(n))}</pre>

      <div className="viz-row">
        <label className="field">Orders on the page
          <input type="range" min={1} max={50} value={n} onChange={(e) => setN(+e.target.value)} /> <b>{n}</b>
        </label>
        <label className="field">Round trip to DB
          <input type="range" min={0.5} max={5} step={0.5} value={rtt} onChange={(e) => setRtt(+e.target.value)} /> <b>{rtt} ms</b>
        </label>
        <button className="primary" onClick={() => { setTick(0); setRunning(true) }}>Run the page</button>
      </div>

      <div className="viz-row">
        <span className={`chip big ${mode === 'lazy' && total > 3 ? 'bad' : 'good'}`}>queries: <b>{Math.min(tick, total)}</b> / {total}</span>
        <span className="chip big">time spent waiting on the database: <b>{(total * rtt).toFixed(1)} ms</b></span>
      </div>

      <div className="querylog" aria-live="polite" aria-label="Query log">
        <AnimatePresence initial={false}>
          {shown.slice(-12).map((q, i) => (
            <motion.code key={tick - Math.min(shown.length, 12) + i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>{q}</motion.code>
          ))}
        </AnimatePresence>
        {shown.length === 0 && <span className="muted small">Press “Run the page” to watch the queries.</span>}
      </div>

      <p className={`note ${mode === 'lazy' && n > 3 ? 'bad' : 'good'}`}>
        {mode === 'lazy'
          ? `${total} queries for ${n} orders. It grows with N, so ${n} orders now becomes 1,000 orders later. This is invisible in dev with 5 rows and painful in production.`
          : mode === 'select'
            ? 'select_related follows the foreign key with a JOIN: 1 query no matter how many orders. Use it for ForeignKey and OneToOne.'
            : 'prefetch_related uses one extra query per relation and stitches the results in Python: 2 queries no matter how many orders. Use it for reverse foreign keys and many-to-many.'}
        {' '}Lock it in with <code>assertNumQueries</code>.
      </p>
    </div>
  )
}
