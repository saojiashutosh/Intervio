import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, useContent, useProgress } from '../context'
import { IconInline } from '../viz/stage/icons'
import { FONTS, PALETTES, useLook, useTheme } from '../theme'

const TABS = [
  { to: '/', label: 'Learn', icon: 'book', end: true },
  { to: '/my-plan', label: 'My plan', icon: 'calendar' },
  { to: '/domains', label: 'Domains', icon: 'grid' },
  { to: '/problems', label: 'Problems', icon: 'repeat' },
  { to: '/practice', label: 'SQL', icon: 'terminal' },
  { to: '/projects', label: 'Projects', icon: 'briefcase' },
  { to: '/interview', label: 'Interview', icon: 'chat' },
]

/** Lessons grouped by track, in the order the content lists them. */
/** An isometric cube in the chosen colours: the same shape the lesson diagrams are built from. */
function LogoMark() {
  return (
    <svg viewBox="0 0 34 34" aria-hidden="true" focusable="false">
      <g strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
        <polygon points="5,10 17,17 17,31 5,24" style={{ fill: 'var(--accent)', stroke: 'var(--accent)' }} />
        <polygon points="29,10 17,17 17,31 29,24" style={{ fill: 'var(--accent2)', stroke: 'var(--accent2)' }} />
        <polygon points="17,3 29,10 17,17 5,10" style={{ fill: 'color-mix(in srgb, var(--accent) 38%, #fff)', stroke: 'color-mix(in srgb, var(--accent) 38%, #fff)' }} />
      </g>
    </svg>
  )
}

function useCourse() {
  const { content } = useContent()
  return useMemo(() => {
    if (!content) return []
    return content.tracks.map((t) => ({
      track: t,
      lessons: content.concepts.filter((c) => content.levels.find((l) => l.level === c.level)?.track === t.slug),
    })).filter((g) => g.lessons.length)
  }, [content])
}

/** Colour and font: the learner chooses what feels good to study with. The choice is remembered in this browser. */
function AppearanceMenu() {
  const { look, update } = useLook()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div className="look" ref={box}>
      <button className="iconbtn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Appearance: colour and font" title="Colour and font">
        <IconInline name="palette" size={18} />
      </button>
      {open && (
        <div className="look-pop" role="dialog" aria-label="Colour and font">
          <p className="look-h">Colour</p>
          <div className="look-colours">
            {PALETTES.map((p) => (
              <button key={p.id} className={look.palette === p.id ? 'on' : ''} aria-pressed={look.palette === p.id} onClick={() => update({ palette: p.id })}>
                <span className="look-dot" style={{ background: p.swatch }} /><span><b>{p.label}</b><small>{p.note}</small></span>
              </button>
            ))}
          </div>
          <p className="look-h">Font</p>
          <div className="look-fonts">
            {FONTS.map((f) => (
              <button key={f.id} className={look.font === f.id ? 'on' : ''} aria-pressed={look.font === f.id} onClick={() => update({ font: f.id })} style={{ fontFamily: f.family }}>
                <span className="look-aa">Aa</span><span><b>{f.label}</b><small>{f.note}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  return (
    <header className="topbar">
      <button className="iconbtn menu-btn" onClick={onMenu} aria-label="Open the course menu"><IconInline name="menu" size={20} /></button>
      <Link to="/" className="logo" aria-label="Intervio home"><span className="logo-mark"><LogoMark /></span><span className="logo-text">Intervio</span></Link>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="tab"><IconInline name={t.icon} size={16} /><span>{t.label}</span></NavLink>
        ))}
      </nav>
      <button className="search" onClick={onSearch} aria-label="Search the course">
        <IconInline name="search" size={16} /><span className="search-text">Search lessons &amp; concepts…</span><kbd>Ctrl K</kbd>
      </button>
      <AppearanceMenu />
      <button className="iconbtn" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title="Theme">
        <IconInline name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
      </button>
      <div className="who">
        {user ? <><span className="muted small who-name">{user}</span><button className="pillbtn" onClick={signOut}>Sign out</button></> : <Link className="pillbtn" to="/login">Sign in</Link>}
      </div>
    </header>
  )
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const course = useCourse()
  const { isDone } = useProgress()
  const { pathname } = useLocation()
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const total = course.reduce((n, g) => n + g.lessons.length, 0)
  const done = course.reduce((n, g) => n + g.lessons.filter((c) => isDone(`concept:${c.slug}`)).length, 0)
  const current = pathname.startsWith('/concept/') ? pathname.slice('/concept/'.length) : ''

  return (
    <>
      {open && <div className="scrim" onClick={onClose} aria-hidden />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Course">
        <button className="iconbtn drawer-close" onClick={onClose} aria-label="Close the course menu"><IconInline name="x" size={18} /></button>
        <nav className="drawer-nav" aria-label="Pages">
          {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.end} onClick={onClose}><IconInline name={t.icon} size={16} />{t.label}</NavLink>)}
        </nav>
        <p className="side-h"><IconInline name="folder" size={16} /> Course <span>{total} lessons</span></p>
        <ul className="tree">
          {course.map(({ track, lessons }) => {
            const d = lessons.filter((c) => isDone(`concept:${c.slug}`)).length
            const hasCurrent = lessons.some((c) => c.slug === current)
            const isOpen = closed[track.slug] === undefined ? hasCurrent : !closed[track.slug]
            return (
              <li key={track.slug} className={`tr tr-${track.slug}`}>
                <button className="tr-head" aria-expanded={isOpen} onClick={() => setClosed((c) => ({ ...c, [track.slug]: isOpen }))}>
                  <span className={`chev ${isOpen ? 'open' : ''}`}><IconInline name="chevron" size={14} /></span>
                  <span className="tr-icon"><IconInline name="folder" size={16} /></span>
                  <span className="tr-title">{track.title}</span>
                  <span className="tr-count">{d}/{lessons.length}</span>
                </button>
                {isOpen && (
                  <ul className="lessons">
                    {lessons.map((c) => (
                      <li key={c.slug}>
                        <NavLink to={`/concept/${c.slug}`} onClick={onClose} className={({ isActive }) => `lesson ${isActive ? 'active' : ''} ${isDone(`concept:${c.slug}`) ? 'done' : ''}`}>
                          <span className="lesson-dot" aria-hidden>{isDone(`concept:${c.slug}`) ? '✓' : ''}</span>{c.title}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
        <div className="side-progress">
          <span className="side-progress-h">Progress <b>{done} / {total}</b></span>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><i style={{ width: `${total ? (100 * done) / total : 0}%` }} /></div>
        </div>
      </aside>
    </>
  )
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const course = useCourse()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const items = useMemo(() => {
    const pages = TABS.map((t) => ({ key: t.to, title: t.label, sub: 'Page', to: t.to, hay: t.label.toLowerCase() }))
    const lessons = course.flatMap((g) => g.lessons.map((c) => ({
      key: c.slug, title: c.title, sub: g.track.title, to: `/concept/${c.slug}`,
      hay: [c.title, c.tagline, g.track.title, ...c.key_points].join(' ').toLowerCase(),
    })))
    return [...lessons, ...pages]
  }, [course])

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return items.slice(0, 8)
    return items.filter((i) => words.every((w) => i.hay.includes(w))).slice(0, 12)
  }, [q, items])

  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 0) } }, [open])
  useEffect(() => { setSel(0) }, [q])

  if (!open) return null
  const go = (to: string) => { onClose(); nav(to) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && results[sel]) go(results[sel].to)
  }
  return (
    <div className="palette-wrap" onClick={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search the course" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="palette-input"><IconInline name="search" size={18} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lessons & concepts…" aria-label="Search" />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" role="listbox">
          {results.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === sel}>
              <button className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => go(r.to)}>
                <span className="r-title">{r.title}</span><span className="r-sub">{r.sub}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="palette-empty">Nothing matches &ldquo;{q}&rdquo;.</li>}
        </ul>
      </div>
    </div>
  )
}
