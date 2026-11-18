import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useContent, usePlan, useProgress } from '../context'
import type { RoadmapDay, Session } from '../types'
import { Ring } from './Home'

const KIND_ICON: Record<Session['kind'], string> = { learn: '📖', practice: '⌨️', interview: '🎤', project: '🛠', capstone: '🏗', review: '🔁', mock: '🧑‍💼' }
const today = () => new Date().toLocaleDateString('en-CA')
const fmt = (m: number) => (m % 60 === 0 ? `${m / 60} h` : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`)
const niceDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const sessionKey = (s: Session) => `rm:${s.id.replace('#', '.')}`

function SessionRow({ s }: { s: Session }) {
  const { isDone, toggle } = useProgress()
  const k = sessionKey(s)
  return (
    <li className={`session ${isDone(k) ? 'done' : ''}`}>
      <input type="checkbox" checked={isDone(k)} onChange={() => toggle(k)} aria-label={`Mark done: ${s.title}`} />
      <div>
        <Link to={s.route}>{KIND_ICON[s.kind]} {s.title}</Link>
        <span className="muted small"> · {fmt(s.minutes)}{s.part[1] > 1 ? ` · part ${s.part[0]}/${s.part[1]}` : ''}</span>
        <p className="muted small">{s.detail}</p>
      </div>
    </li>
  )
}

function Day({ d, highlight }: { d: RoadmapDay; highlight?: boolean }) {
  return (
    <div className={`day ${highlight ? 'today' : ''}`}>
      <h4>{niceDate(d.date)} <span className="muted small">· {d.buffer ? 'buffer day' : fmt(d.minutes)}</span></h4>
      {d.buffer
        ? <p className="muted small">Nothing scheduled. Use it to catch up, redo missed flashcards, or revisit a skipped topic.</p>
        : <ul className="sessions">{d.sessions.map((s) => <SessionRow key={s.id} s={s} />)}</ul>}
    </div>
  )
}

export default function MyPlanPage() {
  const { content } = useContent()
  const { profile, roadmap, roadmapError, clearProfile } = usePlan()
  const { isDone } = useProgress()
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  const [delError, setDelError] = useState<string | null>(null)

  async function onDelete() {
    if (!window.confirm('Delete your roadmap?\n\nThis removes your profile and the tick-marks on your schedule. Your concept progress is kept.')) return
    setDelError(null)
    try { await clearProfile() } catch (e) { setDelError(e instanceof Error ? e.message : 'Could not delete your roadmap.') }
  }

  const days = useMemo(() => roadmap?.weeks.flatMap((w) => w.days) ?? [], [roadmap])
  const t = today()
  const sessionsAll = useMemo(() => days.flatMap((d) => d.sessions), [days])
  const doneCount = sessionsAll.filter((s) => isDone(sessionKey(s))).length
  const pct = sessionsAll.length ? Math.round((doneCount / sessionsAll.length) * 100) : 0

  if (!profile) {
    return (
      <div className="card center">
        <h1>Your personal roadmap</h1>
        <p className="lead">Answer five quick questions and get a day-by-day schedule built around your time.</p>
        <Link className="btn primary" to="/profile">Build my roadmap</Link>
      </div>
    )
  }
  if (roadmapError) return <p className="note bad">{roadmapError}</p>
  if (!roadmap || !content) return <p className="muted">Building your roadmap…</p>

  const { summary: s } = roadmap
  const todayDay = days.find((d) => d.date === t && !d.buffer)
  const nextDay = days.find((d) => d.date > t && !d.buffer)
  const lastDay = days.filter((d) => !d.buffer).at(-1)
  const focus = todayDay ?? nextDay
  const currentWeek = openWeek ?? (roadmap.weeks.find((w) => w.days.some((d) => d.date >= t))?.week ?? roadmap.weeks[0]?.week)

  return (
    <>
      <div className="row between">
        <h1>My roadmap</h1>
        <div className="row">
          <Link className="btn ghost small" to="/profile">Edit profile</Link>
          <button className="danger small" onClick={onDelete}>Delete my roadmap</button>
        </div>
      </div>
      {delError && <p className="note bad" role="alert">{delError}</p>}

      <section className="card summary">
        <Ring pct={pct} />
        <div>
          <p><b>{s.planned_hours} h</b> of study over <b>{s.days_used}</b> days{s.end_date && <>, finishing <b>{niceDate(s.end_date)}</b></>}.</p>
          <p className="muted small">{profile.experience_years} yrs experience · {profile.hours_per_day} h × {profile.days_per_week} days/week · {profile.weeks === 0 ? `about ${Math.ceil(s.study_days / profile.days_per_week)} weeks, no deadline` : `${profile.weeks} weeks`} · {profile.goal === 'interview' ? 'interview prep' : 'deep learning'}</p>
          <p className="muted small">{doneCount}/{sessionsAll.length} sessions done</p>
        </div>
      </section>

      {!s.feasible && (
        <div className="note bad" role="alert">
          <b>This is not enough time to cover even the essentials.</b> The plan below stops where time runs out.
          {s.suggested_hours_per_day && <> Try about <b>{s.suggested_hours_per_day} h/day</b> or more weeks. <Link to="/profile">Change my answers</Link></>}
        </div>
      )}
      {roadmap.cuts.length > 0 && (
        <section className="card">
          <h3>What I had to cut, and why</h3>
          <p className="muted small">Your time budget is {s.budget_hours} h; covering everything takes {s.needed_hours} h. I cut the least interview-critical items first, one at a time, only until it fit:</p>
          <ul>{roadmap.cuts.map((c) => <li key={c}>{c}</li>)}</ul>
          {s.suggested_hours_per_day && <p className="muted small">Studying about {s.suggested_hours_per_day} h/day would fit everything.</p>}
        </section>
      )}
      {roadmap.notes.map((n) => <p key={n} className="note">{n}</p>)}

      <section className="card today-card">
        <h2>{todayDay ? 'Today' : nextDay ? 'Next study day' : 'Plan complete'}</h2>
        {focus ? (
          <>
            {!todayDay && <p className="muted">Nothing scheduled today. Your next session is {niceDate(focus.date)}.</p>}
            <Day d={focus} highlight />
          </>
        ) : <p>You’ve reached the end of the schedule{lastDay ? ` (last session ${niceDate(lastDay.date)})` : ''}. Keep drilling in <Link to="/interview">Interview</Link>.</p>}
      </section>

      <h2>Full schedule</h2>
      {roadmap.weeks.map((w) => {
        const isOpen = currentWeek === w.week
        const real = w.days.filter((d) => !d.buffer)
        const mins = real.reduce((n, d) => n + d.minutes, 0)
        return (
          <section key={w.week} className={`week card ${isOpen ? 'open' : ''}`}>
            <button className="week-head" onClick={() => setOpenWeek(isOpen ? -1 : w.week)} aria-expanded={isOpen}>
              <span className="num">W{w.week}</span>
              <span className="grow"><b>{niceDate(w.days[0].date)} – {niceDate(w.days[w.days.length - 1].date)}</b></span>
              <span className="muted small">{real.length ? fmt(mins) : 'buffer'}</span>
            </button>
            {isOpen && <div className="week-body">{w.days.map((d) => <Day key={d.date} d={d} highlight={d.date === t} />)}</div>}
          </section>
        )
      })}

      <h2>Read &amp; refer</h2>
      <p className="muted">Official documentation for each topic in your plan, in study order. Core (★) topics are what interviews lean on most.</p>
      <div className="reading">
        {roadmap.reading.map((r) => (
          <div key={r.slug} className="card">
            <h3>{r.priority === 1 && <span title="Interview-critical">★ </span>}<Link to={`/concept/${r.slug}`}>{r.title}</Link></h3>
            <ul>{r.references.map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noreferrer noopener">{x.title}</a> <span className="muted small">· {x.kind}</span></li>)}</ul>
          </div>
        ))}
      </div>
      {roadmap.skipped.length > 0 && (
        <p className="muted small">Not in your plan right now: {roadmap.skipped.map((x, i) => <span key={x.slug}>{i > 0 && ', '}<Link to={`/concept/${x.slug}`}>{x.title}</Link></span>)}.</p>
      )}
      <p className="muted small">Want the standard version instead? See the <Link to="/plan">generic 12-week template</Link>.</p>
    </>
  )
}
