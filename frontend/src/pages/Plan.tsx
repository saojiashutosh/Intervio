import { useState } from 'react'
import { useContent, useProgress } from '../context'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function PlanPage() {
  const { content } = useContent()
  const { isDone, toggle } = useProgress()
  const [open, setOpen] = useState<number | null>(null)
  if (!content) return null

  const total = content.plan.length * 6
  const done = content.plan.reduce((n, w) => n + w.days.filter((_, d) => isDone(`plan:${w.week}:${d + 1}`)).length, 0)
  const current = open ?? (content.plan.find((w) => w.days.some((_, d) => !isDone(`plan:${w.week}:${d + 1}`)))?.week ?? 1)

  return (
    <>
      <h1>12-week study plan</h1>
      <p className="lead">About 2 hours a day, six days a week. Mon–Thu learn and build, Fri challenge and explain aloud, Sat project work, Sun rest.</p>
      <div className="bar-track" role="progressbar" aria-valuenow={done} aria-valuemax={total}><div style={{ width: `${(done / total) * 100}%` }} /></div>
      <p className="muted small">{done} of {total} study days complete</p>

      {content.plan.map((w) => {
        const wDone = w.days.filter((_, d) => isDone(`plan:${w.week}:${d + 1}`)).length
        const isOpen = current === w.week
        return (
          <section key={w.week} className={`week card ${isOpen ? 'open' : ''}`}>
            <button className="week-head" onClick={() => setOpen(isOpen ? -1 : w.week)} aria-expanded={isOpen}>
              <span className="num">W{w.week}</span>
              <span className="grow"><b>{w.title}</b></span>
              <span className="muted small">{wDone}/6</span>
            </button>
            {isOpen && (
              <div className="week-body">
                <ul className="days">
                  {w.days.map((d, idx) => {
                    const k = `plan:${w.week}:${idx + 1}`
                    return (
                      <li key={k}>
                        <label className={isDone(k) ? 'done' : ''}>
                          <input type="checkbox" checked={isDone(k)} onChange={() => toggle(k)} />
                          <span><b>{DAY_NAMES[idx]}</b> {d}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
                <p className="deliverable">📦 Deliverable: {w.deliverable}</p>
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
