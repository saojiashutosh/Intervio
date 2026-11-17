import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Controls, useStepper } from './Timeline'

export interface WStep { title: string; note: string; body: ReactNode }

/** Step through a scene: each step has a title, a body (diagram/tables) and a sentence explaining what changed. */
export function Walkthrough({ steps, resetKey }: { steps: WStep[]; resetKey?: unknown }) {
  const s = useStepper(steps.length, resetKey)
  const cur = steps[Math.max(s.i, 0)]
  return (
    <div className="walk">
      <Controls s={s} length={steps.length} />
      <div className="walk-dots" aria-hidden>
        {steps.map((_, n) => <span key={n} className={n <= s.i ? 'on' : ''} />)}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={Math.max(s.i, 0)} className="walk-body" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <h4>{s.i < 0 ? 'Press Play or Step to start' : `Step ${s.i + 1}: ${cur.title}`}</h4>
          {cur.body}
        </motion.div>
      </AnimatePresence>
      {s.i >= 0 && <p className="note" role="status">{cur.note}</p>}
    </div>
  )
}

export interface Attr { n: string; k?: 'PK' | 'FK' | 'UQ' }

/** An entity box as drawn in an ER diagram: name on top, attributes below, key badges. */
export function Entity({ name, attrs, hl, dim, hlAttr }: { name: string; attrs: Attr[]; hl?: boolean; dim?: boolean; hlAttr?: boolean }) {
  return (
    <div className={`ent ${hl ? 'hl' : ''} ${dim ? 'dim' : ''}`}>
      <div className="ent-name">{name}</div>
      <ul>{attrs.map((a) => (
        <li key={a.n} className={hlAttr ? 'hl' : ''}>{a.k && <span className={`kbadge ${a.k}`}>{a.k}</span>}{a.n}</li>
      ))}</ul>
    </div>
  )
}

/** The connector between two entities, with a verb and cardinality text. */
export function RelLink({ verb, card, hl }: { verb?: string; card: string; hl?: boolean }) {
  return <div className={`rellink ${hl ? 'hl' : ''}`}><span className="rel-verb">{verb}</span><span className="rel-line" /><span className="rel-card">{card}</span></div>
}
