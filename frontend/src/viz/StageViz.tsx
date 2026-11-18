import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { useMotion } from '../theme'
import { Predict } from '../components/Predict'
import type { StageScene, StageStep } from '../types'
import { IconInline } from './stage/icons'
import { NodeView, Packet } from './stage/parts'
import { anchor, foldState, iso, radiusOf, sceneBounds, visibleAt } from './stage/geometry'

const TAGS: Record<StageStep['tag'], string> = { problem: 'Problem', technique: 'Technique', solution: 'Solution', insight: 'Key idea', case: 'Case' }
const CALLOUTS = { tip: { t: 'Good to know', i: 'check' }, warn: { t: 'Watch out', i: 'alert' }, insight: { t: 'Key idea', i: 'bolt' } } as const
const SPEED = 170 // px per second along a link


function Floor({ box }: { box: { x: number; y: number; w: number; h: number } }) {
  const lines: ReactElement[] = []
  const span = Math.ceil((box.w + box.h) / 40) + 4
  for (let k = -span; k <= span; k++) {
    const a = iso(k, -span), b = iso(k, span), c = iso(-span, k), d = iso(span, k)
    lines.push(<line key={`a${k}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />, <line key={`b${k}`} x1={c.x} y1={c.y} x2={d.x} y2={d.y} />)
  }
  return <g className="floor">{lines}</g>
}

/** The scenario and step live in the URL hash (#scene=2&step=5, both 1-based) so a step can be linked to and a reload keeps your place. */
function readHash() {
  const h = typeof window === 'undefined' ? '' : window.location.hash
  const sc = /scene=(\d+)/.exec(h), st = /step=(\d+)/.exec(h)
  return { scene: sc ? Math.max(0, +sc[1] - 1) : 0, step: st ? Math.max(0, +st[1] - 1) : 0 }
}
function writeHash(scene: number, step: number) {
  try {
    const h = scene || step ? `#scene=${scene + 1}&step=${step + 1}` : ''
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + h)
  } catch { /* history is unavailable in some embedded views: the step just is not linkable there */ }
}

function Scene({ scene, sceneIndex = 0, startStep = 0 }: { scene: StageScene; sceneIndex?: number; startStep?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [i, setI] = useState(() => Math.max(0, Math.min(startStep, scene.steps.length - 1)))
  const [replay, setReplay] = useState(0)
  const [paused, setPaused] = useState(false)
  const [done, setDone] = useState<Set<number>>(new Set())
  const svgRef = useRef<SVGSVGElement>(null)
  const last = scene.steps.length - 1
  const step = scene.steps[Math.min(i, last)]
  const box = useMemo(() => sceneBounds(scene), [scene])
  const { patch, hud } = useMemo(() => foldState(scene, i), [scene, i])
  const { reduced: still, systemAsks, set: setMotion } = useMotion()
  // Which nodes and which directed roads this step's traffic uses: they light up while the packets run.
  const traffic = useMemo(() => {
    const nodes = new Set<string>(), roads = new Map<string, string>()
    for (const f of step.flows ?? []) {
      f.path.forEach((id) => nodes.add(id))
      for (let k = 1; k < f.path.length; k++) roads.set(`${f.path[k - 1]}>${f.path[k]}`, f.kind)
    }
    return { nodes, roads }
  }, [step])
  const predicted = step.predict && !done.has(i)
  const diagram = scene.nodes.length > 0

  const go = (n: number) => { const t = Math.max(0, Math.min(last, n)); setI(t); setPaused(false); writeHash(sceneIndex, t) }
  const again = () => { setReplay((r) => r + 1); setPaused(false) }

  // SVG animation clocks run from page load; rewind so each step's packets start from the beginning.
  useLayoutEffect(() => { svgRef.current?.setCurrentTime?.(0); svgRef.current?.unpauseAnimations?.() }, [i, replay])
  useEffect(() => { const s = svgRef.current; if (!s) return; if (paused) s.pauseAnimations?.(); else s.unpauseAnimations?.() }, [paused])

  const pos = (id: string) => {
    const n = scene.nodes.find((x) => x.id === id)
    if (!n) return null
    const p = patch[id]
    return { n, x: p?.x ?? n.x, y: p?.y ?? n.y }
  }
  const live = scene.nodes.filter((n) => visibleAt(n, patch[n.id], i))
  const ordered = [...scene.nodes].sort((a, b) => {
    const rank = (n: typeof a) => (n.kind === 'zone' ? 0 : n.kind === 'ring' ? 1 : 2)
    const pa = pos(a.id)!, pb = pos(b.id)!
    return rank(a) - rank(b) || (pa.x + pa.y) - (pb.x + pb.y)
  })

  const linkEnds = (a: string, b: string, trimA = true, trimB = true) => {
    const A = pos(a), B = pos(b)
    if (!A || !B) return null
    const p = anchor(A.n, A.x, A.y), q = anchor(B.n, B.x, B.y)
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
    const ux = (q.x - p.x) / len, uy = (q.y - p.y) / len
    const ra = trimA ? radiusOf(A.n) : 0, rb = trimB ? radiusOf(B.n) : 0
    return { p: { x: p.x + ux * ra, y: p.y + uy * ra }, q: { x: q.x - ux * rb, y: q.y - uy * rb } }
  }

  /** Points a packet visits: start just outside the first node, pass through the middle ones, stop just outside the last. */
  const pathPoints = (ids: string[]) => {
    const es = ids.flatMap((id) => { const A = pos(id); return A ? [{ c: anchor(A.n, A.x, A.y), r: radiusOf(A.n) }] : [] })
    const toward = (from: { x: number; y: number }, to: { x: number; y: number }, r: number) => {
      const len = Math.hypot(to.x - from.x, to.y - from.y) || 1
      return { x: from.x + ((to.x - from.x) / len) * r, y: from.y + ((to.y - from.y) / len) * r }
    }
    return es.map((e, k) => (es.length < 2 ? e.c : k === 0 ? toward(e.c, es[1].c, e.r) : k === es.length - 1 ? toward(e.c, es[k - 1].c, e.r) : e.c))
  }

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1) }
    else if (e.key === 'r' || e.key === 'R') again()
    else if (e.key === ' ' && t.tagName !== 'BUTTON') { e.preventDefault(); setPaused((p) => !p) }
  }

  const changeBadge = (c: string) => (/^[+\-~] /.test(c) ? [c[0], c.slice(2)] : ['~', c])
  const bodyHidden = Boolean(predicted)

  return (
    <div className={`stage ${diagram ? '' : 'no-diagram'}`} tabIndex={0} onKeyDown={onKey} role="group" aria-label={`${scene.title}. Click the diagram, then use the left and right arrow keys to step.`}>
      <div className="stage-top">
        <button className="ghost" onClick={() => go(i - 1)} disabled={i === 0}>← Back</button>
        <span className="stage-top-title"><b>Step {i + 1} of {scene.steps.length}</b> <span className="muted">{step.short ?? step.title}</span></span>
        <button className="primary" onClick={() => go(i + 1)} disabled={i === last}>{i === last ? 'End of lesson' : `Next: ${scene.steps[i + 1].short ?? scene.steps[i + 1].title} →`}</button>
      </div>
      <div className="stage-hud" aria-live="polite">
        {hud.map((h) => (
          <div key={h.k} className={`hud ${h.tone ?? ''}`}>
            <span className="hud-k">{h.k}</span>
            <span key={h.v} className="hud-v">{h.v}</span>
          </div>
        ))}
        {diagram && <div className="stage-tools">
          <button className="ghost" onClick={again} aria-label="Replay the animation"><IconInline name="repeat" size={14} /> Replay</button>
          <button className="ghost" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>{paused ? 'Resume' : 'Pause'}</button>
        </div>}
      </div>

      {diagram && systemAsks && (
        <p className="muted small motion-note" role="status">
          {still ? 'Your system asks for reduced motion, so the diagram is still and the packets do not move. ' : 'Animations are on, although your system asks for reduced motion. '}
          <button className="ghost" onClick={() => setMotion(still)}>{still ? 'Play animations anyway' : 'Back to reduced motion'}</button>
        </p>
      )}

      {diagram && <div className="stage-canvas">
        <svg ref={svgRef} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} style={{ aspectRatio: `${box.w} / ${box.h}` }} role="img" aria-label={`${scene.title}, step ${i + 1} of ${scene.steps.length}: ${step.title}`}>
          <defs>
            <marker id={`${uid}-ah`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,1 L10,5 L0,9 z" fill="currentColor" />
            </marker>
            <clipPath id={`${uid}-clip`}><rect x={box.x} y={box.y} width={box.w} height={box.h} /></clipPath>
          </defs>
          <g clipPath={`url(#${uid}-clip)`}><Floor box={box} /></g>

          {/* zones and the ring sit on the floor, links and nodes above them */}
          {ordered.filter((n) => n.kind === 'zone' || n.kind === 'ring').map((n) => {
            const p = pos(n.id)!
            return <NodeView key={`${n.id}-${replay}`} node={n} patch={patch[n.id]} shown={visibleAt(n, patch[n.id], i)} x={p.x} y={p.y} />
          })}

          <g className="links" key={`links-${replay}`}>
            {scene.links.map((l, k) => {
              const e = linkEnds(l.a, l.b)
              if (!e) return null
              const A = scene.nodes.find((n) => n.id === l.a)!, B = scene.nodes.find((n) => n.id === l.b)!
              const shown = visibleAt(A, patch[A.id], i) && visibleAt(B, patch[B.id], i) && (l.from === undefined || i >= l.from) && (l.until === undefined || i <= l.until)
              const dir = l.dir ?? 'both'
              const fwd = traffic.roads.get(`${l.a}>${l.b}`), back = traffic.roads.get(`${l.b}>${l.a}`)
              const lit = shown && !still ? (fwd ? { kind: fwd, rev: false } : back ? { kind: back, rev: true } : null) : null
              return (
                <g key={k} style={{ animationDelay: `${0.55 + Math.min(k * 0.05, 0.5)}s` }} className={`link ${l.dash ? 'dash' : ''} ${shown ? '' : 'gone'} ${patch[A.id]?.status === 'down' || patch[B.id]?.status === 'down' ? 'weak' : ''}`}>
                  <line x1={e.p.x} y1={e.p.y} x2={e.q.x} y2={e.q.y} markerEnd={dir !== 'none' ? `url(#${uid}-ah)` : undefined} markerStart={dir === 'both' ? `url(#${uid}-ah)` : undefined} />
                  {lit && <line className={`flow-line pk-${lit.kind}`} x1={lit.rev ? e.q.x : e.p.x} y1={lit.rev ? e.q.y : e.p.y} x2={lit.rev ? e.p.x : e.q.x} y2={lit.rev ? e.p.y : e.q.y} />}
                  {l.label && <text x={(e.p.x + e.q.x) / 2} y={(e.p.y + e.q.y) / 2 - 7} textAnchor="middle">{l.label}</text>}
                </g>
              )
            })}
          </g>

          {ordered.filter((n) => n.kind !== 'zone' && n.kind !== 'ring').map((n, ord) => {
            const p = pos(n.id)!
            return <NodeView order={ord} key={`${n.id}-${replay}`} node={n} patch={patch[n.id]} shown={visibleAt(n, patch[n.id], i)} x={p.x} y={p.y} active={traffic.nodes.has(n.id)} />
          })}

          <g className="packets" key={`${i}-${replay}`}>
            {(step.flows ?? []).flatMap((f, fi) => {
              const pts = pathPoints(f.path)
              let length = 0
              for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y)
              const move = Math.max(0.9, length / SPEED)
              const n = f.n ?? 2
              return Array.from({ length: n }, (_, k) => (
                <Packet key={`${fi}-${k}`} pts={pts} kind={f.kind} begin={(f.delay ?? 0) + k * 0.55 + fi * 0.15} move={move} gap={Math.max(0.6, n * 0.55 - move + 0.9)} still={still} />
              ))
            })}
          </g>
        </svg>

        <ul className="sr-only" aria-label="What the diagram shows at this step">
          {live.map((n) => <li key={n.id}>{[patch[n.id]?.label ?? n.label ?? n.id, patch[n.id]?.status && patch[n.id]!.status !== 'ok' ? patch[n.id]!.status : '', patch[n.id]?.pill?.text ?? ''].filter(Boolean).join(': ')}</li>)}
        </ul>
      </div>}

      {diagram && <p className="swipe-hint">Swipe the diagram sideways to see all of it. The text below describes every step.</p>}
      {diagram && (
        <ul className="stage-legend" aria-label="Legend">
          {scene.legend.map((l) => <li key={l.kind}><span className={`swatch pk-${l.kind}`} />{l.label}</li>)}
        </ul>
      )}

      <nav className="stage-rail" aria-label="Steps in this lesson">
        <p className="rail-h">In this lesson <span>Step {i + 1} of {scene.steps.length}</span></p>
        <ol>
          {scene.steps.map((s, k) => (
            <li key={k}>
              <button className={`${k === i ? 'cur' : ''} ${k < i ? 'past' : ''}`} onClick={() => go(k)} aria-current={k === i ? 'step' : undefined} title={s.title}>
                <span className="dotn">{k < i ? '✓' : k + 1}</span>
                <span className="rname">{s.short ?? s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="stage-panel">
        <div className="stage-text" key={i}>
          <p className="stage-step"><span className={`stag ${step.tag}`}>{TAGS[step.tag]}</span> Step {i + 1} / {scene.steps.length}</p>
          <h4>{step.title}</h4>
          {step.predict && (
            <div>
              <Predict key={`p-${scene.id}-${i}`} {...step.predict} onAnswer={() => setDone((d) => new Set(d).add(i))} />
              {!done.has(i) && <button className="linkish" onClick={() => setDone((d) => new Set(d).add(i))}>Skip, just show me</button>}
            </div>
          )}
          {!bodyHidden && (
            <>
              {step.body.map((p, k) => <p key={k}>{p}</p>)}
              {[...(step.card ? [step.card] : []), ...(step.cards ?? [])].map((cd, ci) => (
                <div className="stage-card" key={`${i}-card-${ci}`}>
                  <h5>{cd.title}</h5>
                  {cd.lines.map((l, k) => <p key={k} className={cd.hl?.includes(k) ? 'hl' : ''}>{l}</p>)}
                </div>
              ))}
              {step.callout && (
                <div className={`scallout ${step.callout.kind}`}>
                  <IconInline name={CALLOUTS[step.callout.kind].i} size={16} />
                  <div><b>{CALLOUTS[step.callout.kind].t}</b><p>{step.callout.text}</p></div>
                </div>
              )}
            </>
          )}
        </div>
        <aside className="stage-side">
          {step.changes && step.changes.length > 0 && !bodyHidden && (
            <div>
              <h5>What changed</h5>
              <ul className="changes">{step.changes.map((c, k) => { const [s, t] = changeBadge(c); return <li key={k}><span className={`sg ${s === '+' ? 'add' : s === '-' ? 'del' : 'mod'}`}>{s}</span>{t}</li> })}</ul>
            </div>
          )}
          <div>
            <h5>You will learn</h5>
            <ul className="learn">{scene.learn.map((l) => <li key={l.text} className={i >= l.at ? 'ok' : ''}><span aria-hidden>{i >= l.at ? '✓' : '○'}</span>{l.text}</li>)}</ul>
          </div>
        </aside>
      </div>

      <div className="stage-nav">
        <button className="ghost" onClick={() => go(i - 1)} disabled={i === 0}>← Back</button>
        <span className="muted small hint">{diagram ? 'Click the diagram, then ← → step · R replay · Space pause' : 'Use ← → to step when this panel is focused'}</span>
        <button className="primary" onClick={() => go(i + 1)} disabled={i === last}>{i === last ? 'End of lesson' : `Next: ${scene.steps[i + 1].short ?? scene.steps[i + 1].title} →`}</button>
      </div>
    </div>
  )
}

/** Renders a concept's `stage` scenes: an isometric diagram that changes as you step through the lesson. */
export default function StageViz({ scenes }: { scenes: StageScene[] }) {
  const start = useRef(readHash())
  const [idx, setIdx] = useState(() => Math.max(0, Math.min(start.current.scene, scenes.length - 1)))
  if (!scenes.length) return <p className="muted">No animation yet.</p>
  const s = scenes[Math.min(idx, scenes.length - 1)]
  return (
    <div>
      {scenes.length > 1 && (
        <div className="seg" role="group" aria-label="Scenario">
          {scenes.map((x, k) => <button key={x.id} className={k === idx ? 'on' : ''} onClick={() => { setIdx(k); writeHash(k, 0) }}>{x.title}</button>)}
        </div>
      )}
      <Scene key={s.id} scene={s} sceneIndex={Math.min(idx, scenes.length - 1)} startStep={Math.min(idx, scenes.length - 1) === start.current.scene ? start.current.step : 0} />
    </div>
  )
}

