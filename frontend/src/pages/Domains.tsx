import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useContent, usePlan } from '../context'
import { Cite, Evidence } from '../components/Cite'
import type { DomainTopic, LevelBand } from '../types'

const bandFor = (years: number): LevelBand['band'] => (years < 2 ? '0-2' : years < 5 ? '2-5' : '5+')

export default function DomainsPage() {
  const { content } = useContent()
  const { profile } = usePlan()
  const [slug, setSlug] = useState('backend')
  const [band, setBand] = useState<LevelBand['band']>(profile ? bandFor(profile.experience_years) : '2-5')

  const domain = content?.domains.find((d) => d.slug === slug)
  const info = content?.level_bands.find((b) => b.band === band)

  const grouped = useMemo(() => {
    const m = new Map<string, DomainTopic[]>()
    for (const t of domain?.topics.filter((x) => x.band === band) ?? []) m.set(t.area, [...(m.get(t.area) ?? []), t])
    return [...m.entries()]
  }, [domain, band])

  if (!content || !domain || !info) return null
  const all = domain.topics
  const covered = all.filter((t) => t.app).length

  return (
    <>
      <h1>What to know, by domain and experience</h1>
      <p className="lead">Pick a role and your experience band. Every item cites its sources, and shows whether I read the source or only saw a search summary.</p>

      <div className="seg" role="tablist" aria-label="Domain">
        {content.domains.map((d) => <button key={d.slug} role="tab" aria-selected={d.slug === slug} className={d.slug === slug ? 'on' : ''} onClick={() => setSlug(d.slug)}>{d.title.split(' (')[0]}</button>)}
      </div>
      <div className="seg" role="tablist" aria-label="Experience">
        {content.level_bands.map((b) => <button key={b.band} role="tab" aria-selected={b.band === band} className={b.band === band ? 'on' : ''} onClick={() => setBand(b.band)}>{b.label}</button>)}
      </div>
      {profile && <p className="muted small">Pre-selected from your profile ({profile.experience_years} yrs).</p>}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{domain.title}</h2>
        <p>{domain.blurb} <Cite keys={domain.sources} /></p>
        <div className="note"><b>{info.title} ({info.label}).</b> {info.focus} <Cite keys={info.sources} /></div>
        <p className="muted small">{content.notes['level-note']}</p>
      </section>

      <p className="muted small">Intervio currently teaches <b>database engineering</b>. {covered} of {all.length} topics for this domain link to a lesson; the rest are a knowledge map only, with no study material yet.</p>

      {grouped.length === 0 && <p className="muted">No topics recorded for this band yet.</p>}
      {grouped.map(([area, topics]) => (
        <section key={area}>
          <h3>{area}</h3>
          {topics.map((t) => (
            <div key={t.topic} className="card topic">
              <div className="topic-head">
                <b>{t.topic}</b>
                <Evidence keys={t.sources} />
                <Cite keys={t.sources} />
              </div>
              <p>{t.detail}</p>
              {t.app
                ? <Link className="btn ghost small" to={`/concept/${t.app}`}>Learn in Intervio →</Link>
                : <span className="muted small">Not in Intervio yet</span>}
            </div>
          ))}
        </section>
      ))}

      <p className="muted small">Numbers like <span className="cite read">3</span> link to the <Link to="/sources">Sources</Link> page. Green = read directly; amber = search summary only.</p>
    </>
  )
}
