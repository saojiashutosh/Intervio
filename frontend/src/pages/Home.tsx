import { Link } from 'react-router-dom'
import { useContent, useProgress, useAuth, usePlan } from '../context'

export function Ring({ pct, size = 84 }: { pct: number; size?: number }) {
  const r = size / 2 - 7, c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset .6s ease' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--text)" fontWeight="700" fontSize={size / 4}>{pct}%</text>
    </svg>
  )
}

export default function Home() {
  const { content } = useContent()
  const { isDone } = useProgress()
  const { user } = useAuth()
  const { profile } = usePlan()
  if (!content) return null

  const concepts = content.concepts
  const doneCount = concepts.filter((c) => isDone(`concept:${c.slug}`)).length
  const pct = Math.round((doneCount / concepts.length) * 100)
  const next = concepts.find((c) => !isDone(`concept:${c.slug}`))

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Database engineering · interview prep</p>
          <h1>Learn how databases really work — then explain it under pressure.</h1>
          <p className="lead">
            {concepts.length} core concepts, a roadmap built around your time, SQL drills, and animations that let you <em>break</em> things on purpose.
            Every concept includes the Django ORM angle interviewers ask about.
          </p>
          <div className="row">
            {!profile && <Link className="btn primary" to="/profile">Build my personal roadmap</Link>}
            {profile && <Link className="btn primary" to="/my-plan">Open my roadmap</Link>}
            {next
              ? <Link className="btn ghost" to={`/concept/${next.slug}`}>{doneCount ? 'Continue' : 'Start'}: {next.title}</Link>
              : <Link className="btn ghost" to="/interview">Everything done — drill interviews</Link>}
          </div>
          {!user && <p className="muted small">Progress is saved in this browser. <Link to="/login">Sign in</Link> to sync it and unlock spaced-repetition flashcards.</p>}
        </div>
        <div className="hero-ring"><Ring pct={pct} size={120} /><span className="muted small">{doneCount}/{concepts.length} concepts</span></div>
      </section>

      {content.levels.map((lv) => {
        const list = concepts.filter((c) => c.level === lv.level)
        return (
          <section key={lv.level} className="level">
            <header>
              <h2><span className="lvl">Level {lv.level}</span> {lv.title}</h2>
              <p className="muted">{lv.weeks} · {lv.blurb}</p>
            </header>
            <div className="concept-grid">
              {list.map((c) => (
                <Link key={c.slug} to={`/concept/${c.slug}`} className={`card concept-card ${isDone(`concept:${c.slug}`) ? 'done' : ''}`}>
                  <span className="num">{c.n}</span>
                  <h3>{c.title}</h3>
                  <p>{c.tagline}</p>
                  <span className="meta">{c.viz && <span className="tag">▶ animation</span>}<span className="muted small">{c.week}</span>{isDone(`concept:${c.slug}`) && <span className="tick">✓</span>}</span>
                </Link>
              ))}
            </div>
            <Link to="/projects" className="project-strip">🛠 Project: <b>{lv.project}</b> →</Link>
          </section>
        )
      })}
    </>
  )
}
