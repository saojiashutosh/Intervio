import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useContent } from '../context'
import type { Source } from '../types'

const KIND_ORDER: Source['kind'][] = ['official', 'survey', 'book', 'curriculum', 'community-guide', 'prep-guide', 'job-post']
const KIND_LABEL: Record<Source['kind'], string> = {
  official: 'Official documentation & employers', survey: 'Surveys', book: 'Books', curriculum: 'Curricula & roadmaps',
  'community-guide': 'Community guides', 'prep-guide': 'Interview-prep guides (commercial / blogs)', 'job-post': 'Job postings & posting analyses',
}
const KIND_NOTE: Record<Source['kind'], string> = {
  official: 'Most reliable for facts.', survey: 'Real usage numbers; says nothing about interviews.', book: 'Deep and durable; opinions on interview fit vary.',
  curriculum: 'What a field teaches; not what interviews ask.', 'community-guide': 'Useful, not authoritative.',
  'prep-guide': 'Often SEO or vendor content. Treat as signals.', 'job-post': 'What employers ask for; one employer or one analysis is not the market.',
}

export default function SourcesPage() {
  const { content } = useContent()
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash || !content) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' })
  }, [hash, content])

  const usage = useMemo(() => {
    const u: Record<string, { topics: number; concepts: number }> = {}
    const bump = (k: string, f: 'topics' | 'concepts') => { (u[k] ??= { topics: 0, concepts: 0 })[f]++ }
    content?.domains.forEach((d) => d.topics.forEach((t) => t.sources.forEach((k) => bump(k, 'topics'))))
    content?.concepts.forEach((c) => c.sources.forEach((k) => bump(k, 'concepts')))
    return u
  }, [content])

  if (!content) return null
  const read = content.sources.filter((s) => s.checked === 'read').length

  return (
    <>
      <h1>Sources &amp; how much to trust them</h1>
      <p className="lead">{content.sources.length} sources: <b>{read}</b> I read directly in this build, <b>{content.sources.length - read}</b> I only saw as search-result summaries.</p>
      <div className="note wait">
        <b>No official standard exists.</b> Companies level and interview differently. These sources show patterns, not rules. {content.notes['basis-note']}
      </div>

      {KIND_ORDER.map((kind) => {
        const list = content.sources.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => s.kind === kind)
        if (!list.length) return null
        return (
          <section key={kind}>
            <h2>{KIND_LABEL[kind]}</h2>
            <p className="muted small">{KIND_NOTE[kind]}</p>
            {list.map(({ s, n }) => (
              <div key={s.key} id={s.key} className="card source">
                <div className="topic-head">
                  <span className={`cite ${s.checked}`}>{n}</span>
                  <a href={s.url} target="_blank" rel="noreferrer noopener"><b>{s.title}</b></a>
                  <span className={`badge ${s.checked === 'read' ? 'ok' : 'warn'}`}>{s.checked === 'read' ? 'read directly' : 'search summary only'}</span>
                </div>
                <p className="muted small">{s.publisher}</p>
                <p>{s.used_for}</p>
                <p className="muted small">Used for {usage[s.key]?.topics ?? 0} domain topic(s) and {usage[s.key]?.concepts ?? 0} concept priority note(s).</p>
              </div>
            ))}
          </section>
        )
      })}
    </>
  )
}
