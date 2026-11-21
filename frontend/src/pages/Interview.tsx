import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useContent } from '../context'
import type { Card, CardStats } from '../types'

type Tab = 'review' | 'speed' | 'browse'
interface DeckCard { id: number; q: string; a: string; meta: string; box?: number }

/** One-card-at-a-time deck: read, answer aloud, reveal, self-grade. */
function Deck({ cards, onGrade, finishLabel }: { cards: DeckCard[]; onGrade?: (c: DeckCard, ok: boolean) => void; finishLabel: string }) {
  const [i, setI] = useState(0)
  const [show, setShow] = useState(false)
  const [score, setScore] = useState({ ok: 0, miss: 0 })
  const [missed, setMissed] = useState<DeckCard[]>([])

  useEffect(() => { setI(0); setShow(false); setScore({ ok: 0, miss: 0 }); setMissed([]) }, [cards])

  if (cards.length === 0) return <p className="card">🎉 Nothing due right now. Come back later or try the speed round.</p>
  if (i >= cards.length) {
    return (
      <div className="card center">
        <h3>{finishLabel}</h3>
        <p className="lead">{score.ok} / {cards.length} correct</p>
        {missed.length > 0 && <><h4>Revisit these</h4><ul className="missed">{missed.map((m) => <li key={m.id}>{m.q}</li>)}</ul></>}
      </div>
    )
  }
  const c = cards[i]
  const grade = (ok: boolean) => {
    onGrade?.(c, ok)
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), miss: s.miss + (ok ? 0 : 1) }))
    if (!ok) setMissed((m) => [...m, c])
    setShow(false); setI(i + 1)
  }
  return (
    <div className="card flash">
      <div className="muted small">{i + 1} / {cards.length} · {c.meta}{c.box !== undefined && c.box > 0 ? ` · box ${c.box}` : ''}</div>
      <h3>{c.q}</h3>
      {!show
        ? <button className="btn primary" onClick={() => setShow(true)}>Show answer</button>
        : (
          <>
            <p className="answer">{c.a}</p>
            <div className="row"><button className="btn ghost" onClick={() => grade(false)}>✗ Missed it</button><button className="btn primary" onClick={() => grade(true)}>✓ Got it</button></div>
          </>
        )}
    </div>
  )
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}

export default function InterviewPage() {
  const { content } = useContent()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>(user ? 'review' : 'speed')
  const [topic, setTopic] = useState('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [round, setRound] = useState(0)
  const [due, setDue] = useState<{ cards: Card[]; stats: CardStats } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const all = useMemo(() => {
    if (!content) return []
    const conceptQs = content.concepts.flatMap((c) => c.interview.map((q) => ({ ...q, meta: c.title })))
    return [...conceptQs, ...content.general_questions.map((q) => ({ ...q, meta: q.topic }))]
  }, [content])

  useEffect(() => {
    if (tab !== 'review' || !user) return
    setErr(null)
    api.cards(15).then(setDue).catch((e) => setErr(e.message))
  }, [tab, user, round])

  const speed = useMemo(() => shuffle(all).slice(0, 10).map((q) => ({ id: q.id, q: q.q, a: q.a, meta: q.meta })), [all, round])
  const browse = all.filter((q) => (topic === 'all' || q.topic === topic) && (!query || (q.q + q.a).toLowerCase().includes(query.toLowerCase())))
  const deck = useMemo<DeckCard[]>(() => (due?.cards ?? []).map((c) => ({ id: c.id, q: c.q, a: c.a, meta: c.concept ?? c.topic, box: c.box })), [due])

  if (!content) return null
  return (
    <>
      <h1>Interview drill</h1>
      <p className="lead">{all.length} questions. Answer out loud before revealing — recognising an answer is not the same as producing it.</p>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'review'} className={tab === 'review' ? 'on' : ''} onClick={() => setTab('review')}>Spaced review</button>
        <button role="tab" aria-selected={tab === 'speed'} className={tab === 'speed' ? 'on' : ''} onClick={() => setTab('speed')}>Speed round</button>
        <button role="tab" aria-selected={tab === 'browse'} className={tab === 'browse' ? 'on' : ''} onClick={() => setTab('browse')}>Browse all</button>
      </div>

      {tab === 'review' && (
        !user
          ? <div className="card"><p><Link to="/login">Sign in</Link> to use spaced review: cards you miss come back tomorrow; cards you know return in 3, 7, then 21 days (Leitner boxes).</p></div>
          : err ? <p className="note bad">{err}</p>
          : !due ? <p className="muted">Loading…</p>
          : (
            <>
              <div className="stats">
                <span className="chip">new <b>{due.stats.new}</b></span><span className="chip">due <b>{due.stats.due}</b></span>
                <span className="chip">mastered <b>{due.stats.mastered}</b></span><span className="chip">total <b>{due.stats.total}</b></span>
              </div>
              <Deck cards={deck} finishLabel="Session complete" onGrade={(c, ok) => { api.review(c.id, ok).catch(() => setErr('Could not save that review.')) }} />
              <button className="ghost" onClick={() => setRound((r) => r + 1)}>Load next batch</button>
            </>
          )
      )}

      {tab === 'speed' && (
        <>
          <Deck cards={speed} finishLabel="Speed round done" />
          <button className="ghost" onClick={() => setRound((r) => r + 1)}>New random round</button>
        </>
      )}

      {tab === 'browse' && (
        <>
          <div className="row">
            <input className="search" placeholder="Search questions…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search questions" />
            {['all', 'concept', 'python', 'dsa', 'system-design', 'networking', 'os', 'web', 'devops', 'behavioral', 'sql', 'django', 'ops'].map((t) => <button key={t} className={`chipbtn ${topic === t ? 'on' : ''}`} onClick={() => setTopic(t)}>{t}</button>)}
          </div>
          {browse.map((q) => (
            <div key={q.id} className={`qa ${open === q.id ? 'open' : ''}`}>
              <button onClick={() => setOpen(open === q.id ? null : q.id)} aria-expanded={open === q.id}>{q.q}<span>{open === q.id ? '−' : '+'}</span></button>
              {open === q.id && <p>{q.a}</p>}
            </div>
          ))}
          {browse.length === 0 && <p className="muted">No matches.</p>}
        </>
      )}
    </>
  )
}
