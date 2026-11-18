import type { NodePatch, StageNode, Tone } from '../../types'
import { Icon } from './icons'
import { CROWD_D, CROWD_W, HEIGHT, SHAPES, UX, UY, heightOf, iso, pillWidth, shapeOf } from './geometry'

const PEOPLE: Tone[] = ['blue', 'orange', 'green', 'purple', 'yellow']

function lines(label: string) {
  if (label.includes('\n')) return label.split('\n')
  if (label.length > 11 && label.includes(' ')) {
    const mid = label.length / 2
    let best = -1
    for (let i = 0; i < label.length; i++) if (label[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
    return [label.slice(0, best), label.slice(best + 1)]
  }
  return [label]
}

/** A rounded label that floats next to a node: optional icon, optional load bar. */
export function PillView({ text, tone = 'grey', icon, load, x = 0, y = 0 }: { text: string; tone?: Tone; icon?: string; load?: number; x?: number; y?: number }) {
  const bar = load !== undefined
  const w = pillWidth(text, icon, bar)
  const h = 22
  const lc = load === undefined ? '' : load >= 85 ? 'bad' : load >= 60 ? 'warn' : 'good'
  const left = -w / 2
  return (
    <g className={`pill tone-${tone}`} transform={`translate(${x} ${y})`}>
      <rect className="pill-bg" x={left} y={-h / 2} width={w} height={h} rx={h / 2} />
      {icon && <Icon name={icon} size={13} x={left + 14} y={0} />}
      {bar && (
        <>
          <rect className="meter-bg" x={left + 12 + (icon ? 17 : 0)} y={-3} width={40} height={6} rx={3} />
          <rect className={`meter ${lc}`} x={left + 12 + (icon ? 17 : 0)} y={-3} width={Math.max(2, 0.4 * Math.min(100, load))} height={6} rx={3} />
        </>
      )}
      <text className="pill-text" x={bar ? left + 12 + (icon ? 17 : 0) + 46 + (w - 18 - (icon ? 17 : 0) - 50) / 2 : left + (icon ? 17 : 0) + (w - (icon ? 17 : 0)) / 2} y={4} textAnchor="middle">{text}</text>
    </g>
  )
}

/** A low slab with its value on top: one cell of an array, one plate of a stack, one item waiting in a queue. */
function Block({ label, icon }: { label: string; icon: string }) {
  const H = SHAPES[icon].h, k = icon === 'cell' ? 0.82 : 0.95
  const x = UX * k, y = UY * k
  return (
    <g>
      <polygon className="f-left" points={`${-x},${-H} 0,${-H + y} 0,${y} ${-x},0`} />
      <polygon className="f-right" points={`0,${-H + y} ${x},${-H} ${x},0 0,${y}`} />
      <polygon className="f-top" points={`0,${-H - y} ${x},${-H} 0,${-H + y} ${-x},${-H}`} />
      <polygon className="cube-outline" points={`0,${-H - y} ${x},${-H} ${x},0 0,${y} ${-x},0 ${-x},${-H}`} />
      <text className="node-text block-text" x={0} y={-H + 5} textAnchor="middle">{label}</text>
    </g>
  )
}

/** A round node, lit from the top left: a tree node, a graph vertex or a heap entry. */
function Ball({ label }: { label: string }) {
  return (
    <g>
      <circle className="f-left ball-body" cx={0} cy={-26} r={25} />
      <circle className="f-top ball-light" cx={-4} cy={-30} r={19} />
      <circle className="cube-outline" cx={0} cy={-26} r={25} />
      <text className="node-text ball-text" x={0} y={-21} textAnchor="middle">{label}</text>
    </g>
  )
}

function Cube({ label, icon }: { label: string; icon?: string }) {
  if (icon === 'cell' || icon === 'plate') return <Block label={label} icon={icon} />
  if (icon === 'ball') return <Ball label={label} />
  const H = HEIGHT.cube
  const ls = lines(label)
  const ys = ls.length === 1 ? [5] : [-3, 11]
  const rack = icon === 'server' || icon === 'cpu'
  return (
    <g>
      <polygon className="f-left" points={`${-UX},${-H} 0,${-H + UY} 0,${UY} ${-UX},0`} />
      <polygon className="f-right" points={`0,${-H + UY} ${UX},${-H} ${UX},0 0,${UY}`} />
      <polygon className="f-top" points={`0,${-H - UY} ${UX},${-H} 0,${-H + UY} ${-UX},${-H}`} />
      <path className="cube-edge" d={`M${-UX},${-H} L0,${-H + UY} L${UX},${-H} M0,${-H + UY} L0,${UY}`} />
      <polygon className="cube-outline" points={`0,${-H - UY} ${UX},${-H} ${UX},0 0,${UY} ${-UX},0 ${-UX},${-H}`} />
      {rack && <Leds />}
      {icon === 'queue' && <Belt />}
      {icon === 'cloud' && <Puffs />}
      {icon && <g className={icon === 'gear' ? 'icon-spin' : icon === 'bolt' ? 'icon-zap' : ''}><Icon name={icon} size={22} x={0} y={-H} /></g>}
      <text className="node-text" textAnchor="middle">
        {ls.map((l, i) => <tspan key={i} x={0} y={ys[i]}>{l}</tspan>)}
      </text>
    </g>
  )
}

/** Status lights on a server's right face: they blink out of step, like a rack. */
function Leds() {
  return (
    <g className="leds">
      {[0, 1, 2].map((k) => {
        const x = 14 + k * 11
        return <circle key={k} className={`led led-${k}`} cx={x} cy={UY - x * (UY / UX) - 7} r={2.3} />
      })}
    </g>
  )
}

/** A conveyor on the top face: small blocks slide along it, the way a queue hands out work in order. */
function Belt() {
  return (
    <g className="belt" transform={`translate(0 ${-HEIGHT.cube + 2})`}>
      {[0, 1, 2].map((k) => (
        <polygon key={k} className={`belt-item belt-${k}`} points="-6,0 0,-3.5 6,0 0,3.5" />
      ))}
    </g>
  )
}

/** Two puffs on the top face so a cloud service reads as a cloud. */
function Puffs() {
  const y = -HEIGHT.cube
  return (
    <g className="puffs">
      <circle className="puff" cx={-24} cy={y - 8} r={7} /><circle className="puff" cx={26} cy={y - 6} r={6} />
    </g>
  )
}

function Cylinder({ icon }: { icon?: string }) {
  const H = HEIGHT.db, rx = 42, ry = 21
  return (
    <g>
      <path className="f-left" d={`M${-rx},${-H} v${H} a${rx},${ry} 0 0 0 ${rx * 2},0 v${-H} z`} />
      <ellipse className="f-top" cx={0} cy={-H} rx={rx} ry={ry} />
      {icon && <Icon name={icon} size={22} x={0} y={-H + 2} />}
    </g>
  )
}

function Slab({ w, d, z, cls }: { w: number; d: number; z: number; cls: string }) {
  const a = iso(-w / 2, -d / 2, z), b = iso(w / 2, -d / 2, z), c = iso(w / 2, d / 2, z), e = iso(-w / 2, d / 2, z)
  const c0 = iso(w / 2, d / 2, 0), e0 = iso(-w / 2, d / 2, 0), b0 = iso(w / 2, -d / 2, 0)
  return (
    <g>
      <polygon className="f-left" points={`${e.x},${e.y} ${c.x},${c.y} ${c0.x},${c0.y} ${e0.x},${e0.y}`} />
      <polygon className="f-right" points={`${c.x},${c.y} ${b.x},${b.y} ${b0.x},${b0.y} ${c0.x},${c0.y}`} />
      <polygon className={cls} points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${e.x},${e.y}`} />
    </g>
  )
}

function Crowd({ n = 9, w = CROWD_W, d = CROWD_D }: { n?: number; w?: number; d?: number }) {
  const cols = Math.ceil(Math.sqrt(n * 1.3)), rows = Math.ceil(n / cols)
  const ppl: { x: number; y: number; t: Tone }[] = []
  for (let i = 0; i < n; i++) {
    const cx = i % cols, cy = Math.floor(i / cols)
    const p = iso(((cx + 0.5) / cols - 0.5) * (w * 0.8), ((cy + 0.5) / rows - 0.5) * (d * 0.8), 12)
    ppl.push({ x: p.x, y: p.y, t: PEOPLE[(i * 2 + cy) % PEOPLE.length] })
  }
  ppl.sort((a, b) => a.y - b.y)
  return (
    <g>
      <Slab w={w} d={d} z={12} cls="f-top slab" />
      {ppl.map((p, i) => (
        <g key={i} className={`tone-${p.t}`} transform={`translate(${p.x} ${p.y})`}>
          <rect className="f-right person" x={-4.5} y={-17} width={9} height={17} rx={4} />
          <circle className="f-top person" cx={0} cy={-22} r={5} />
        </g>
      ))}
    </g>
  )
}

function Device({ icon }: { icon?: string }) {
  const phone = icon === 'phone'
  const hw = phone ? 0.16 : 0.42, ht = phone ? 46 : 34
  const p = (dx: number, z: number) => iso(dx, -0.12, 8 + z)
  const q = [p(-hw, 0), p(hw, 0), p(hw, ht), p(-hw, ht)]
  return (
    <g>
      <Slab w={phone ? 0.9 : 1.4} d={phone ? 0.9 : 1} z={8} cls="f-top slab" />
      <polygon className="screen" points={q.map((v) => `${v.x},${v.y}`).join(' ')} />
      <line className="screen-line" x1={q[0].x + 4} y1={q[0].y - ht * 0.3} x2={q[1].x - 4} y2={q[1].y - ht * 0.3 - 1.5} />
      <line className="screen-line" x1={q[0].x + 4} y1={q[0].y - ht * 0.55} x2={(q[0].x + q[1].x) / 2} y2={q[0].y - ht * 0.55 + 4} />
    </g>
  )
}

function Zone({ w = 3, h = 3, label }: { w?: number; h?: number; label?: string }) {
  const a = iso(-w / 2, -h / 2), b = iso(w / 2, -h / 2), c = iso(w / 2, h / 2), e = iso(-w / 2, h / 2)
  return (
    <g>
      <polygon className="zone" points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${e.x},${e.y}`} />
      {label && <text className="zone-text" x={c.x - ((c.x - e.x) / 2)} y={c.y + 15} textAnchor="middle">{label}</text>}
    </g>
  )
}

function Ring({ r = 2 }: { r?: number }) {
  return (
    <g>
      <ellipse className="ring-wide" cx={0} cy={0} rx={r * UX * Math.SQRT2} ry={r * UY * Math.SQRT2} />
      <ellipse className="ring-thin" cx={0} cy={0} rx={r * UX * Math.SQRT2} ry={r * UY * Math.SQRT2} />
    </g>
  )
}

function Dot({ label }: { label?: string }) {
  return (
    <g>
      <ellipse className="dot-shadow" cx={0} cy={2} rx={9} ry={4.5} />
      <circle className="f-top dot" cx={0} cy={-7} r={7.5} />
      {label && <text className="dot-text" x={0} y={-20} textAnchor="middle">{label}</text>}
    </g>
  )
}

/** One node at its current position, with its status, pill and load meter. Everything is drawn around (0, 0) = floor centre. */
export function NodeView({ node, patch, shown, x, y, active = false, order = 0 }: { node: StageNode; patch?: NodePatch; shown: boolean; x: number; y: number; active?: boolean; order?: number }) {
  const o = iso(x, y)
  const tone = patch?.tone ?? node.tone ?? 'blue'
  const status = patch?.status ?? 'ok'
  const label = patch?.label ?? node.label
  const H = heightOf(node)
  const shape = shapeOf(node)
  const top = shape ? -H - 24 : node.kind === 'cube' ? -H - UY - 18 : node.kind === 'db' ? -H - 21 - 18 : -H - 54
  const below = node.kind === 'db' ? 21 + 16 : node.kind === 'crowd' || node.kind === 'device' ? 40 : 0
  const pill = patch?.pill
  const base = node.icon === 'ball' ? { cx: 0, cy: 0, rx: 32, ry: 15 } : node.kind === 'db' ? { cx: 0, cy: 0, rx: 44, ry: 20 } : node.kind === 'device' ? { cx: 0, cy: 0, rx: 50, ry: 22 } : { cx: 0, cy: 0, rx: 56, ry: 29 }
  const solid = node.kind === 'cube' || node.kind === 'db' || node.kind === 'device'
  const delay = (Array.from(node.id).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 30) / 10
  const showDown = status === 'down' && !pill
  return (
    <g className={`node kind-${node.kind} tone-${tone} st-${status} ${shown ? '' : 'gone'}`} style={{ transform: `translate(${o.x}px, ${o.y}px)` }} data-node={node.id}>
      <g className="enter" style={{ animationDelay: `${Math.min(order * 0.07, 0.8)}s` }}>
      {node.kind === 'zone' && <Zone w={node.w} h={node.h} label={label} />}
      {node.kind === 'ring' && <Ring r={node.r} />}
      {solid && <ellipse className="ground-shadow" cx={0} cy={base.cy} rx={base.rx} ry={base.ry} />}
      {solid && active && <ellipse className="active-ring" cx={0} cy={base.cy} rx={base.rx + 4} ry={base.ry + 2} />}
      <g className={solid ? 'bob' : ''} style={solid ? { animationDelay: `-${delay}s` } : undefined}>
        {node.kind === 'cube' && <Cube label={label ?? ''} icon={node.icon} />}
        {node.kind === 'db' && <Cylinder icon={node.icon ?? 'db'} />}
        {node.kind === 'crowd' && <Crowd n={node.n} w={node.w} d={node.h} />}
        {node.kind === 'device' && <Device icon={node.icon} />}
        {node.kind === 'dot' && <Dot label={label} />}
      </g>
      {status === 'down' && node.kind !== 'dot' && (
        <g className="x-mark" transform={`translate(0 ${-H * 0.45})`}>
          <path d="M-15,-15 L15,15 M15,-15 L-15,15" />
        </g>
      )}
      {(node.kind === 'db' || node.kind === 'crowd' || node.kind === 'device') && label && (
        <PillView text={label} tone="grey" icon={node.kind === 'crowd' ? 'users' : node.kind === 'device' ? 'user' : 'db'} y={below} />
      )}
      {patch?.load != null && <PillView text={`${Math.round(patch.load)}%`} icon="cpu" load={patch.load} y={top - (pill ? 26 : 0)} tone="grey" />}
      {pill && <PillView text={pill.text} tone={pill.tone} icon={pill.icon} y={top} />}
      {showDown && <PillView text="down" tone="red" icon="alert" y={top} />}
      </g>
    </g>
  )
}

/** A packet that follows a polyline, then waits, then repeats. Uses SVG animation so it needs no script per frame. */
export function Packet({ pts, kind, begin, move, gap, still }: { pts: { x: number; y: number }[]; kind: string; begin: number; move: number; gap: number; still?: boolean }) {
  if (pts.length < 2) return null
  if (still) {
    const m = pts[Math.floor((pts.length - 1) / 2)], n = pts[Math.floor((pts.length - 1) / 2) + 1]
    return <circle className={`packet pk-${kind}`} cx={(m.x + n.x) / 2} cy={(m.y + n.y) / 2} r={6} />
  }
  const d = 'M' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')
  const total = move + gap
  const f = move / total
  return (
    <circle className={`packet pk-${kind}`} r={6} opacity={0}>
      <animateMotion path={d} dur={`${total}s`} begin={`${begin}s`} repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes={`0;${f.toFixed(3)};1`} />
      <animate attributeName="opacity" values="0;1;1;0;0" keyTimes={`0;${(f * 0.06).toFixed(3)};${(f * 0.94).toFixed(3)};${f.toFixed(3)};1`} dur={`${total}s`} begin={`${begin}s`} repeatCount="indefinite" />
    </circle>
  )
}
