import { useMemo, useState } from 'react'

/** The same five points as the lesson's code sample: the truth is y = 2x + 1. */
const XS = [1, 2, 3, 4, 5]
const YS = [3, 5, 7, 9, 11]
const STEPS = 60

function mse(w: number, b: number) {
  return XS.reduce((sum, x, i) => sum + (w * x + b - YS[i]) ** 2, 0) / XS.length
}

/** Gradient descent from w = 0, b = 0. Returns the loss before any step, then after every step. */
function lossCurve(rate: number, steps: number) {
  let w = 0
  let b = 0
  const out = [mse(w, b)]
  for (let s = 0; s < steps; s++) {
    const ws = XS.reduce((sum, x, i) => sum + (w * x + b - YS[i]) * 2 * x, 0) / XS.length
    const bs = XS.reduce((sum, x, i) => sum + (w * x + b - YS[i]) * 2, 0) / XS.length
    w -= rate * ws
    b -= rate * bs
    out.push(mse(w, b))
  }
  return out
}

// Colour follows the entity, in the fixed categorical order (blue, orange, aqua). The rate is the identity, not its rank.
const SERIES = [
  { key: 'small', rate: 0.0001, name: 'Too small', color: 'var(--lc-1)', note: 'barely moves' },
  { key: 'large', rate: 0.2, name: 'Too large', color: 'var(--lc-2)', note: 'grows, off the chart' },
  { key: 'good', rate: 0.05, name: 'About right', color: 'var(--lc-3)', note: 'falls, then flattens' },
] as const

const W = 640
const H = 330
const M = { l: 62, r: 20, t: 14, b: 46 }
const LO = -3 // 10^-3
const HI = 4 // 10^4
const X = (s: number) => M.l + (s / STEPS) * (W - M.l - M.r)
const Y = (loss: number) => {
  const e = Math.min(HI, Math.max(LO, Math.log10(Math.max(loss, 1e-12))))
  return M.t + ((HI - e) / (HI - LO)) * (H - M.t - M.b)
}
const TICKS = [-3, -2, -1, 0, 1, 2, 3, 4]
const tickLabel = (e: number) => (e >= 3 ? `${10 ** (e - 3)}k` : String(10 ** e))
const fmt = (v: number) => (v >= 1e6 ? v.toExponential(1).replace('e+', ' x 10^') : v >= 100 ? Math.round(v).toLocaleString('en-US') : v >= 1 ? v.toFixed(2) : v.toFixed(4))

export function LossCurveViz() {
  const [step, setStep] = useState(10)
  const data = useMemo(() => SERIES.map((s) => ({ ...s, loss: lossCurve(s.rate, STEPS) })), [])
  // the first step where the too-large line leaves the top of the plot
  const exit = Math.max(1, data[1].loss.findIndex((v) => v > 10 ** HI))

  /** Cut a line where it leaves the plot at the top, so a diverging curve ends in an arrow instead of a fake value. */
  const path = (loss: number[]) => {
    const parts: string[] = []
    for (let s = 0; s < loss.length; s++) {
      parts.push(`${parts.length ? 'L' : 'M'}${X(s).toFixed(1)},${Y(loss[s]).toFixed(1)}`)
      if (loss[s] > 10 ** HI) break
    }
    return parts.join(' ')
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setStep(Math.max(0, Math.min(STEPS, Math.round(((px - M.l) / (W - M.l - M.r)) * STEPS))))
  }

  return (
    <div className="losschart">
      <ul className="lc-legend" aria-label="Learning rates">
        {data.map((s) => (
          <li key={s.key}><span className="lc-key" style={{ background: s.color }} aria-hidden="true" /><b>{s.name}</b> <span className="muted">rate {s.rate}</span></li>
        ))}
      </ul>
      <div className="lc-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Loss against training step for three learning rates, on a log scale. The about-right rate falls and flattens, the too-small rate barely moves and the too-large rate grows past the top of the chart." onPointerMove={onMove} onPointerDown={onMove}>
        {TICKS.map((e) => (
          <g key={e}>
            <line className="lc-grid" x1={M.l} x2={W - M.r} y1={Y(10 ** e)} y2={Y(10 ** e)} />
            <text className="lc-axis" x={M.l - 8} y={Y(10 ** e) + 4} textAnchor="end">{tickLabel(e)}</text>
          </g>
        ))}
        {[0, 10, 20, 30, 40, 50, 60].map((s) => (
          <text key={s} className="lc-axis" x={X(s)} y={H - M.b + 18} textAnchor="middle">{s}</text>
        ))}
        <line className="lc-base" x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} />
        <text className="lc-title" x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle">Training step</text>
        <text className="lc-title" transform={`translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle">Loss (each line is 10 times the one below)</text>

        {data.map((s) => (
          <path key={s.key} d={path(s.loss)} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* the diverging line leaves the top: mark it so nobody reads a value off the edge */}
        <path className="lc-arrow" d={`M${X(exit) - 5},${M.t + 12} L${X(exit)},${M.t + 2} L${X(exit) + 5},${M.t + 12}`} fill="none" stroke="var(--lc-2)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* direct labels, in text colours: the colour is carried by the line, not the words */}
        <text className="lc-label" x={X(exit) + 12} y={M.t + 12}>too large: keeps growing</text>
        <text className="lc-label" x={X(STEPS) - 4} y={Y(data[2].loss[STEPS]) - 16} textAnchor="end">about right: flattens near 0</text>
        <text className="lc-label" x={X(STEPS) - 4} y={Y(data[0].loss[STEPS]) - 8} textAnchor="end">too small: still high</text>

        {/* crosshair and dots at the chosen step */}
        <line className="lc-cross" x1={X(step)} x2={X(step)} y1={M.t} y2={H - M.b} />
        {data.map((s) => (s.loss[step] <= 10 ** HI ? <circle key={s.key} cx={X(step)} cy={Y(s.loss[step])} r={4.5} fill={s.color} className="lc-dot" /> : null))}
      </svg>
      </div>

      <label className="logslider">
        <span>Training step: <b>{step}</b> <span className="muted small">(drag, or point at the chart)</span></span>
        <input type="range" min={0} max={STEPS} step={1} value={step} aria-label="Training step" onChange={(e) => setStep(Number(e.target.value))} />
      </label>

      <ul className="lc-read" role="status" aria-label={`Loss at step ${step}`}>
        {data.map((s) => (
          <li key={s.key}><span className="lc-key" style={{ background: s.color }} aria-hidden="true" /><b>{fmt(s.loss[step])}</b> <span className="muted">{s.name.toLowerCase()} (rate {s.rate})</span></li>
        ))}
      </ul>

      <p className="muted small">Same five points and the same code as the sample: the truth is y = 2x + 1, and training starts at w = 0, b = 0 (loss 57). The vertical scale is logarithmic, so a fall from 100 to 1 looks the same size as a fall from 1 to 0.01. The too-large line passes 10,000 on step {exit}, and the arrow shows it keeps climbing.</p>

      <details className="lc-table">
        <summary>Show the numbers as a table</summary>
        <table>
          <thead><tr><th scope="col">Step</th>{data.map((s) => <th key={s.key} scope="col">{s.name} ({s.rate})</th>)}</tr></thead>
          <tbody>
            {[0, 1, 2, 3, 5, 10, 20, 40, 60].map((s) => (
              <tr key={s}><th scope="row">{s}</th>{data.map((d) => <td key={d.key}>{fmt(d.loss[s])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
