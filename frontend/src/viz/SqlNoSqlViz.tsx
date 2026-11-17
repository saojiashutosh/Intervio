import { useState } from 'react'
import { motion } from 'framer-motion'
import { Predict } from '../components/Predict'

const STORES = ['PostgreSQL', 'Redis', 'Document store', 'Columnar / wide-column', 'Graph database'] as const
type Store = (typeof STORES)[number]

const SCENARIOS: { text: string; best: Store; also?: Store; why: string }[] = [
  { text: 'Orders and payments: money moves, and you need transactions and constraints.', best: 'PostgreSQL',
    why: 'ACID transactions, foreign keys and CHECK constraints are exactly what protects financial data. This is your system of record.' },
  { text: 'Login sessions, rate-limit counters and a hot cache. Everything expires in minutes.', best: 'Redis',
    why: 'In-memory key-value with TTLs is built for ephemeral, high-speed data. Losing it is acceptable, so it is not your source of truth.' },
  { text: 'A product catalogue where each category has different attributes, and you also join it to orders.', best: 'PostgreSQL', also: 'Document store',
    why: 'JSONB gives flexible attributes inside a relational database, so joins and transactions stay. A document store is reasonable if you never join across entities.' },
  { text: 'Billions of clickstream events: append-only, queried as large aggregates.', best: 'Columnar / wide-column',
    why: 'Columnar and wide-column stores are optimised for huge append-heavy datasets and scanning a few columns across many rows.' },
  { text: '"Friends of friends who liked this product": deep relationship traversals.', best: 'Graph database',
    why: 'Traversing many hops is what graph databases index for. In SQL it becomes repeated self-joins that get slow quickly.' },
]

export default function SqlNoSqlViz() {
  const [picks, setPicks] = useState<(Store | null)[]>(SCENARIOS.map(() => null))
  const score = picks.reduce((n, p, i) => n + (p === SCENARIOS[i].best ? 1 : p && p === SCENARIOS[i].also ? 0.5 : 0), 0)
  const done = picks.filter(Boolean).length

  return (
    <div>
      <Predict
        question="Which single datastore is the best default system of record for an e-commerce site's orders and payments?"
        options={['A relational database such as PostgreSQL', 'A key-value cache', 'A graph database']} answer={0}
        why="Orders and payments need transactions and enforced integrity. Other stores then serve specific needs around it. Now match five scenarios yourself."
      />
      {SCENARIOS.map((s, i) => {
        const pick = picks[i]
        const right = pick === s.best
        const partial = !right && !!pick && pick === s.also
        return (
          <div key={s.text} className="card scenario">
            <p><b>{i + 1}.</b> {s.text}</p>
            <div className="row">
              {STORES.map((st) => (
                <button key={st} disabled={pick !== null} className={`opt ${pick ? (st === s.best ? 'right' : st === pick ? 'wrong' : '') : ''}`}
                  onClick={() => setPicks((p) => p.map((x, j) => (j === i ? st : x)))}>{st}</button>
              ))}
            </div>
            {pick && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={`note ${right || partial ? 'good' : 'bad'}`}>
                <b>{right ? 'Correct.' : partial ? 'Also reasonable.' : `Best answer: ${s.best}.`}</b> {s.why}
              </motion.p>
            )}
          </div>
        )
      })}
      <p className="chip big">score: <b>{score}</b> / {SCENARIOS.length} <span className="muted small">({done} answered)</span></p>
      <button className="ghost" onClick={() => setPicks(SCENARIOS.map(() => null))}>Try again</button>
    </div>
  )
}
