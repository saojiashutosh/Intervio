import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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

const words = (...parts: (string | string[])[]) => parts.flat().join(' ').split(/\s+/).filter(Boolean).length

export default function ConceptPage() {
  const { slug } = useParams()
  const { content } = useContent()
  const { isDone, toggle } = useProgress()
  const [sqlTab, setSqlTab] = useState(0)
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

  const readMin = Math.max(1, Math.round(words(c.explain, c.key_points, c.pitfalls, c.exercise) / 200))
  const steps = [
    ...(c.viz ? [{ id: 'play', label: 'Play with it' }] : []),
    { id: 'read', label: 'Read' },
    ...(c.sql.length ? [{ id: 'sql', label: isDb ? 'SQL' : 'Code' }] : []),
    ...(hasDjango ? [{ id: 'django', label: 'Django' }] : []),
    { id: 'practice', label: 'Practice' },
    { id: 'interview', label: 'Check yourself' },
  ]

  return (
    <article className="concept">
      <p className="crumbs"><Link to="/">Roadmap</Link> / {track?.title} / Level {c.level}: {level?.title} / {c.week}</p>
      <h1><span className="num">{c.n}</span> {c.title}</h1>
      <p className="lead">{c.tagline}</p>
      <p className="readtime">About {readMin} min to read{c.viz ? ' + 3–5 min with the animation' : ''}. Suggested order: play first, then read.</p>

      <nav className="stepbar" aria-label="Lesson steps">
        {steps.map((s, n) => <a key={s.id} href={`#${s.id}`}><span className="n">{n + 1}</span>{s.label}</a>)}
      </nav>

      {c.everyday?.story && (
        <section className="everyday" aria-label="In everyday life">
          <h2>In everyday life</h2>
          <p className="plain"><b>In plain words:</b> {c.everyday.plain}</p>
          <p>{c.everyday.story}</p>
          {c.everyday.maps.length > 0 && (
            <table>
              <thead><tr><th>In the story</th><th>In this lesson</th></tr></thead>
              <tbody>{c.everyday.maps.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
            </table>
          )}
          <p className="muted small">A comparison to help you picture it. Real systems are more detailed, and the lesson below gives the exact version.</p>
        </section>
      )}

      {c.viz && (
        <div id="play">
          <Visualizer id={c.viz} scenes={c.scenes} />
          {c.lab && (
            <details className="lab">
              <summary>Try it yourself: the interactive lab</summary>
              <Visualizer id={c.lab} />
            </details>
          )}
        </div>
      )}

      <section id="read">
        <h2>Understand it</h2>
        {c.viz && <p className="muted">You have just seen it happen. Here is the idea behind what you saw.</p>}
        {c.explain.map((p, idx) => <Prose key={idx} block={p} />)}
        <div className="callout"><h4>Remember this</h4><ul>{c.key_points.map((k) => <li key={k}>{k}</li>)}</ul></div>
      </section>

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

      <section id="practice">
        <h2>Practice</h2>
        <p className="exercise">{c.exercise}</p>
        <RelatedProblems slug={c.slug} />
        <h3>Common pitfalls</h3>
        <ul className="pitfalls">{c.pitfalls.map((p) => <li key={p}>{p}</li>)}</ul>
      </section>

      <section id="interview">
        <h2>Check yourself: interview questions</h2>
        {c.interview.map((x) => <QA key={x.id} q={x.q} a={x.a} />)}
        <p className="muted small">Say your answer out loud first, then reveal. Aim for 30–60 seconds with an example.</p>
      </section>

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
    </article>
  )
}
