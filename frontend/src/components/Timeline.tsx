import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export interface Step {
  lane: 'A' | 'B' | 'DB'
  title: string
  sql?: string
  note?: string
  /** Database/world state after this step. */
  state: Record<string, string>
  tone?: 'good' | 'bad' | 'wait'
}

const LANE_LABEL = { A: 'Session A', B: 'Session B', DB: 'Database' } as const

export function useStepper(length: number, resetKey: unknown) {
  const [i, setI] = useState(-1)
  const [playing, setPlaying] = useState(false)
  useEffect(() => { setI(-1); setPlaying(false) }, [resetKey])
  useEffect(() => {
    if (!playing) return
    if (i >= length - 1) { setPlaying(false); return }
    const t = setTimeout(() => setI((x) => x + 1), 1300)
    return () => clearTimeout(t)
  }, [playing, i, length])
  return {
    i, playing,
    next: () => { setPlaying(false); setI((x) => Math.min(x + 1, length - 1)) },
    prev: () => { setPlaying(false); setI((x) => Math.max(x - 1, -1)) },
    reset: () => { setPlaying(false); setI(-1) },
    toggle: () => { if (i >= length - 1) setI(-1); setPlaying((p) => !p) },
  }
}

export function Controls({ s, length }: { s: ReturnType<typeof useStepper>; length: number }) {
  return (
    <div className="controls">
      <button className="ghost" onClick={s.prev} disabled={s.i < 0} aria-label="Previous step">◀ Back</button>
      <button className="primary" onClick={s.toggle}>{s.playing ? 'Pause' : s.i >= length - 1 ? 'Replay' : 'Play'}</button>
      <button className="ghost" onClick={s.next} disabled={s.i >= length - 1} aria-label="Next step">Step ▶</button>
      <button className="ghost" onClick={s.reset}>Reset</button>
      <span className="muted small">{Math.max(s.i + 1, 0)} / {length}</span>
    </div>
  )
}

/** Three columns (A | database | B). Steps appear in the lane that performed them. */
export function Timeline({ steps, resetKey, labels, lanes = ['A', 'DB', 'B'] }: {
  steps: Step[]; resetKey: unknown; labels?: Partial<Record<'A' | 'B' | 'DB', string>>; lanes?: ('A' | 'B' | 'DB')[]
}) {
  const s = useStepper(steps.length, resetKey)
  const shown = steps.slice(0, s.i + 1)
  const current = s.i >= 0 ? steps[s.i] : null
  const initial = steps[0] ? Object.fromEntries(Object.keys(steps[0].state).map((k) => [k, '—'])) : {}
  const state = current?.state ?? initial

  return (
    <div>
      <Controls s={s} length={steps.length} />
      <div className="lanes" style={{ ['--cols' as string]: lanes.length }}>
        {lanes.map((lane) => (
          <div key={lane} className={`lane lane-${lane}`}>
            <h4>{labels?.[lane] ?? LANE_LABEL[lane]}</h4>
            <AnimatePresence initial={false}>
              {shown.map((st, idx) => st.lane === lane && (
                <motion.div
                  key={idx}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`bubble ${st.tone ?? ''} ${idx === s.i ? 'current' : ''}`}
                >
                  <strong>{st.title}</strong>
                  {st.sql && <code>{st.sql}</code>}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <div className="statebar" aria-live="polite">
        {Object.entries(state).map(([k, v]) => (
          <motion.span key={k + v} className={`chip ${current?.tone ?? ''}`} initial={{ scale: 1.15 }} animate={{ scale: 1 }}>
            {k}: <b>{v}</b>
          </motion.span>
        ))}
      </div>
      {current?.note && <p className={`note ${current.tone ?? ''}`} role="status">{current.note}</p>}
    </div>
  )
}
