import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Controls, useStepper } from '../components/Timeline'
import { Predict } from '../components/Predict'

type Variant = 'seq' | 'index' | 'stale'
interface Node { label: string; detail: string; est: number; act: number; explain: string }

const QUERY = `SELECT id, name FROM products\nWHERE category_id = 12 AND active\nORDER BY created_at DESC LIMIT 20;`

const PLANS: Record<Variant, { total: string; buffers: string; nodes: Node[] }> = {
  seq: {
    total: 'Execution Time: 38.4 ms', buffers: 'Buffers: shared hit=1,845',
    nodes: [
      { label: 'Limit', detail: 'rows=20', est: 20, act: 20, explain: 'The root. It takes the first 20 rows its child hands up and stops asking for more.' },
      { label: 'Sort', detail: 'Sort Key: created_at DESC · top-N heapsort', est: 2500, act: 2431, explain: 'It must sort every matching row just to find the newest 20. Nothing can be returned until the Seq Scan below finishes.' },
      { label: 'Seq Scan on products', detail: 'Filter: category_id = 12 AND active · Rows Removed by Filter: 97,569', est: 2500, act: 2431, explain: 'The leaf, where the time goes: it reads all 100,000 rows and throws 97,569 away. Estimated (2,500) is close to actual (2,431), so the statistics are healthy.' },
    ],
  },
  index: {
    total: 'Execution Time: 0.09 ms', buffers: 'Buffers: shared hit=24',
    nodes: [
      { label: 'Limit', detail: 'rows=20', est: 20, act: 20, explain: 'Same root, but now its child can hand rows over immediately.' },
      { label: 'Index Scan using idx_products_cat_created on products', detail: 'Index Cond: category_id = 12 (partial index: active)', est: 20, act: 20, explain: 'The index is already ordered by created_at DESC within the category, so there is no Sort node. It reads about 20 rows and stops: 24 buffers instead of 1,845.' },
    ],
  },
  stale: {
    total: 'Execution Time: 212 ms', buffers: 'Buffers: shared hit=1,845',
    nodes: [
      { label: 'Limit', detail: 'rows=20', est: 20, act: 20, explain: 'Looks fine at the top, which is why you always read the whole tree.' },
      { label: 'Sort', detail: 'Sort Method: external merge (spilled to disk)', est: 3, act: 48211, explain: 'The planner budgeted memory for 3 rows and got 48,211, so the sort spilled to disk and got slow.' },
      { label: 'Seq Scan on products', detail: 'Filter: category_id = 12 AND active', est: 3, act: 48211, explain: 'Estimated rows=3 versus actual rows=48,211 is the tell-tale sign of stale statistics. After a bulk load, run ANALYZE products (and check autovacuum) and compare again.' },
    ],
  },
}

const TITLES: Record<Variant, string> = { seq: 'No index', index: 'With an index', stale: 'Stale statistics' }

export default function PlanViz() {
  const [variant, setVariant] = useState<Variant>('seq')
  const plan = PLANS[variant]
  const order = useMemo(() => [...plan.nodes.keys()].reverse(), [plan]) // leaves first
  const s = useStepper(order.length, variant)
  const active = s.i >= 0 ? order[s.i] : -1
  const doneIdx = new Set(order.slice(0, s.i + 1))

  return (
    <div>
      <Predict
        question="EXPLAIN prints a tree. Which node does PostgreSQL execute FIRST: the Limit at the top, the Sort, or the Seq Scan at the bottom?"
        options={['Limit (top)', 'Sort (middle)', 'Seq Scan (leaf, at the bottom)']} answer={2}
        why="You read a plan from the leaves up: the deepest node produces rows, and each parent consumes them. Step through the plan below. (Row counts and timings here are illustrative.)"
      />
      <div className="seg" role="group" aria-label="Plan variant">
        {(Object.keys(PLANS) as Variant[]).map((v) => <button key={v} className={variant === v ? 'on' : ''} onClick={() => setVariant(v)}>{TITLES[v]}</button>)}
      </div>
      <pre className="codebox">{QUERY}</pre>
      <Controls s={s} length={order.length} />

      <div className="plan" aria-label="Query plan">
        {plan.nodes.map((n, idx) => {
          const bad = n.act > n.est * 10
          return (
            <motion.div key={`${variant}-${idx}`} className={`plan-node ${active === idx ? 'active' : ''} ${doneIdx.has(idx) ? 'done' : ''}`} style={{ marginLeft: idx * 22 }}
              animate={{ scale: active === idx ? 1.02 : 1 }}>
              <div className="plan-head"><b>{idx > 0 && '→ '}{n.label}</b></div>
              <div className="muted small">{n.detail}</div>
              <div className="plan-rows">
                <span className="chip">estimated rows: <b>{n.est.toLocaleString()}</b></span>
                <span className={`chip ${bad ? 'bad' : ''}`}>actual rows: <b>{n.act.toLocaleString()}</b></span>
              </div>
            </motion.div>
          )
        })}
        <div className="muted small plan-foot">{plan.buffers} · {plan.total}</div>
      </div>
      {active >= 0 && <p className={`note ${variant === 'stale' && active > 0 ? 'bad' : ''}`} role="status"><b>Step {s.i + 1}: {plan.nodes[active].label}.</b> {plan.nodes[active].explain}</p>}
      <p className="muted small">Cost numbers are the planner's guess in arbitrary units, not milliseconds. Compare estimated vs actual rows, and read buffers and actual time for the truth. Use EXPLAIN (ANALYZE, BUFFERS) and, for writes, wrap it in BEGIN … ROLLBACK.</p>
    </div>
  )
}
