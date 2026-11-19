import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useContent, useProgress } from '../context'
import type { ProblemRow } from '../types'
import { CodeBlock } from '../components/CodeBlock'
import { Cite } from '../components/Cite'
import { Visualizer } from '../viz'
import { InlineViz, isInlineId } from '../viz/inline'

function QA({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`qa ${open ? 'open' : ''}`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>{q}<span>{open ? '−' : '+'}</span></button>
      {open && <p>{a}</p>}
    </div>
  )
}

/** Problems from the problem bank that belong to this lesson (data structures and algorithms lessons). */
function RelatedProblems({ slug }: { slug: string }) {
  const [rows, setRows] = useState<ProblemRow[]>([])
  useEffect(() => { let live = true; api.problems().then((r) => { if (live) setRows(r.filter((x) => x.concept === slug)) }).catch(() => {}); return () => { live = false } }, [slug])
  if (!rows.length) return null
  return (
    <div className="card">
      <b>Practice in the problem bank</b>
      <ul className="problem-list">
        {rows.map((r) => <li key={r.slug}><Link to={`/problems/${r.slug}`}>{r.title}</Link><span className={`diff ${r.difficulty}`}>{r.difficulty}</span></li>)}
      </ul>
      <p className="muted small">Write Python in the page and run it against tests, with nothing to install.</p>
    </div>
  )
}

/** Lesson text is a list of strings. "## x" = subheading, "> x" = worked example, lines starting "- " = bullets. */
function Prose({ block }: { block: string }) {
  if (block.startsWith('@viz:')) {
    const id = block.slice(5).trim()
    return isInlineId(id) ? <InlineViz id={id} /> : null
  }
  if (block.startsWith('## ')) return <h3 className="lesson-h">{block.slice(3)}</h3>
  if (block.startsWith('> ')) {
    return <div className="example"><span className="example-tag">Example</span>{block.slice(2).split('\n').map((l, i) => <p key={i}>{l}</p>)}</div>
  }
  const lines = block.split('\n')
  if (lines.every((l) => l.startsWith('- '))) return <ul className="lesson-list">{lines.map((l) => <li key={l}>{l.slice(2)}</li>)}</ul>
  return <p>{block}</p>
}

type StepId = 'picture' | 'watch' | 'read' | 'code' | 'practice' | 'check' | 'finish'

export default function ConceptPage() {
  const { slug } = useParams()
  const { content } = useContent()
  const { isDone, toggle } = useProgress()
  const [params, setParams] = useSearchParams()
  const [sqlTab, setSqlTab] = useState(0)
  const wanted = params.get('s')
  // Scroll to the top whenever the learner moves to another step or another lesson.
  useEffect(() => { window.scrollTo(0, 0) }, [wanted, slug])
  if (!content) return null

  const i = content.concepts.findIndex((c) => c.slug === slug)
  if (i < 0) return <p>Concept not found. <Link to="/">Back home</Link></p>
  const c = content.concepts[i]
  const prev = content.concepts[i - 1], next = content.concepts[i + 1]
  const level = content.levels.find((l) => l.level === c.level)
  const key = `concept:${c.slug}`
  const sql = c.sql[Math.min(sqlTab, c.sql.length - 1)]
  const track = content.tracks.find((t) => t.slug === level?.track)
  const isDb = level?.track === 'database'
  const hasDjango = Boolean(c.django?.code)

  // A lesson is a short course: one thing on each screen, in the order a beginner needs it.
  const steps: { id: StepId; label: string }[] = [
    ...(c.everyday?.story ? [{ id: 'picture' as const, label: 'Picture it' }] : []),
    ...(c.viz ? [{ id: 'watch' as const, label: 'Watch it' }] : []),
    { id: 'read', label: 'Read' },
    ...(c.sql.length || hasDjango ? [{ id: 'code' as const, label: isDb ? 'SQL' : 'Code' }] : []),
    { id: 'practice', label: 'Practice' },
    { id: 'check', label: 'Check yourself' },
    { id: 'finish', label: 'Finish' },
  ]
  const found = steps.findIndex((s) => s.id === wanted)
  const cur = found < 0 ? 0 : found
  const step = steps[cur]
  const last = steps.length - 1
  const go = (n: number) => setParams({ s: steps[Math.max(0, Math.min(last, n))].id })

  return (
    <article className="concept study">
      <p className="crumbs"><Link to="/">Roadmap</Link> / {track?.title} / {level?.title}</p>
      <h1><span className="num">{c.n}</span> {c.title}</h1>
      <p className="lead">{c.tagline}</p>

      <nav className="lesson-steps" aria-label="Lesson steps">
        <p className="lesson-count">Step {cur + 1} of {steps.length}</p>
        <ol>
          {steps.map((s, n) => (
            <li key={s.id} className={n < cur ? 'past' : n === cur ? 'cur' : ''}>
              <button onClick={() => go(n)} aria-current={n === cur ? 'step' : undefined}>
                <span className="dotn">{n < cur ? '✓' : n + 1}</span>
                <span className="lname">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {step.id === 'picture' && c.everyday && (
        <section id="picture" className="lesson-body" aria-label="In everyday life">
          <h2>Picture it first</h2>
          <p className="plain">{c.everyday.plain}</p>
          <p>{c.everyday.story}</p>
          {c.everyday.maps.length > 0 && (
            <div className="everyday">
              <h3>What each part of the story means</h3>
              <table>
                <thead><tr><th>In the story</th><th>In this lesson</th></tr></thead>
                <tbody>{c.everyday.maps.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {c.everyday.words && c.everyday.words.length > 0 && (
            <div className="everyday">
              <h3>Words you will meet</h3>
              <dl className="words">
                {c.everyday.words.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}
              </dl>
            </div>
          )}
          <p className="muted small">A comparison to help you picture it. Real systems are more detailed, and the next steps give the exact version.</p>
        </section>
      )}

      {step.id === 'watch' && c.viz && (
        <div id="play" className="lesson-wide">
          <p className="muted">Use the Next button on the animation to go one small step at a time. Each step tells you what just changed.</p>
          <Visualizer id={c.viz} scenes={c.scenes} />
          {c.lab && (
            <details className="lab">
              <summary>Try it yourself: the interactive lab</summary>
              <Visualizer id={c.lab} />
            </details>
          )}
        </div>
      )}

      {step.id === 'read' && (
        <section id="read" className="lesson-body">
          <h2>Understand it</h2>
          {c.explain.map((p, idx) => <Prose key={idx} block={p} />)}
          <div className="callout"><h4>Remember this</h4><ul>{c.key_points.map((k) => <li key={k}>{k}</li>)}</ul></div>
        </section>
      )}

      {step.id === 'code' && (
        <div className="lesson-body">
          {c.sql.length > 0 && (
            <section id="sql">
              <h2>{isDb ? 'In SQL' : 'Try it in code'}</h2>
              {c.sql.length > 1 && (
                <div className="seg">{c.sql.map((s, idx) => <button key={s.title} className={idx === sqlTab ? 'on' : ''} onClick={() => setSqlTab(idx)}>{s.title}</button>)}</div>
              )}
              <CodeBlock code={sql.code} lang={(sql.lang ?? 'sql') as 'sql' | 'py' | 'sh' | 'js'} title={sql.title} />
            </section>
          )}
          {hasDjango && (
            <section id="django">
              <h2>In Django <span className="tag">your day job</span></h2>
              <CodeBlock code={c.django.code} lang="py" title={c.django.title} />
              {c.django.note && <p className="callout">{c.django.note}</p>}
            </section>
          )}
        </div>
      )}

      {step.id === 'practice' && (
        <section id="practice" className="lesson-body">
          <h2>Practice</h2>
          <p className="exercise">{c.exercise}</p>
          <RelatedProblems slug={c.slug} />
          <h3>Common mistakes</h3>
          <ul className="pitfalls">{c.pitfalls.map((p) => <li key={p}>{p}</li>)}</ul>
        </section>
      )}

      {step.id === 'check' && (
        <section id="interview" className="lesson-body">
          <h2>Check yourself: interview questions</h2>
          <p className="muted">Say your answer out loud first, then open it. Aim for 30 to 60 seconds with an example.</p>
          {c.interview.map((x) => <QA key={x.id} q={x.q} a={x.a} />)}
        </section>
      )}

      {step.id === 'finish' && (
        <div className="lesson-body">
          <section id="refer">
            <h2>Read &amp; refer</h2>
            <p className="muted small">Official sources, about {c.hours} h for a beginner{c.priority === 1 ? ' · interview-critical topic' : ''}.</p>
            <ul className="refs">
              {c.references.map((r) => <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer noopener">{r.title}</a> <span className="muted small">· {r.kind}</span></li>)}
            </ul>
          </section>
          <section id="why">
            <h2>Why this priority?</h2>
            <p>{c.basis} <Cite keys={c.sources} /></p>
            <p className="muted small">{content.notes['basis-note']}</p>
          </section>
          <div className="complete">
            <button className={`btn ${isDone(key) ? 'ghost' : 'primary'}`} onClick={() => toggle(key)}>
              {isDone(key) ? '✓ Completed — undo' : 'Mark concept complete'}
            </button>
            <div className="pager">
              {prev ? <Link to={`/concept/${prev.slug}`}>← {prev.title}</Link> : <span />}
              {next ? <Link to={`/concept/${next.slug}`}>{next.title} →</Link> : <Link to="/interview">Drill interviews →</Link>}
            </div>
          </div>
        </div>
      )}

      <div className="lesson-nav" role="navigation" aria-label="Move through the lesson">
        <button className="btn ghost" onClick={() => go(cur - 1)} disabled={cur === 0}>← Back</button>
        <span className="lesson-nav-mid">{step.label}</span>
        {cur < last
          ? <button className="btn primary" onClick={() => go(cur + 1)}>Continue: {steps[cur + 1].label} →</button>
          : next ? <Link className="btn primary" to={`/concept/${next.slug}`}>Next lesson →</Link> : <Link className="btn primary" to="/interview">Drill interviews →</Link>}
      </div>
    </article>
  )
}
