import { useState } from 'react'
import { DataTable, type DRow } from '../components/DataTable'
import { Predict } from '../components/Predict'
import { Walkthrough, type WStep } from '../components/Walkthrough'
import { CodeBlock } from '../components/CodeBlock'
import type { Block, Scene } from '../types'

const TONES = new Set(['good', 'bad', 'wait', 'changed'])

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'text':
      return <p>{b.text}</p>
    case 'list':
      return <ul className="lesson-list">{b.items.map((i) => <li key={i}>{i}</li>)}</ul>
    case 'code':
      return <CodeBlock code={b.code} lang={(b.lang ?? 'py') as 'sql' | 'py' | 'sh' | 'js'} title={b.title} />
    case 'table': {
      const rows: DRow[] = b.rows.map((cells, i) => ({ id: i, cells, tone: (b.tones?.[i] && TONES.has(b.tones[i] as string) ? b.tones[i] : undefined) as DRow['tone'] }))
      return <DataTable title={b.title} cols={b.cols} rows={rows} note={b.note} />
    }
    case 'flow':
      return (
        <div className="flow" role="list">
          {b.nodes.map((n, i) => (
            <span key={i} className="flow-item" role="listitem">
              <span className={`flow-node ${n.state ?? 'idle'}`}>{n.label}</span>
              {i < b.nodes.length - 1 && <span className="flow-arrow" aria-hidden>→</span>}
            </span>
          ))}
        </div>
      )
    case 'chips':
      return <div className="statebar">{b.items.map((c) => <span key={c.k} className={`chip ${c.tone ?? ''}`}>{c.k}: <b>{c.v}</b></span>)}</div>
  }
}

/** Renders a concept's `scenes` JSON: optional predict question, then a step-by-step walkthrough. */
export default function ScenesViz({ scenes }: { scenes: Scene[] }) {
  const [idx, setIdx] = useState(0)
  if (!scenes.length) return <p className="muted">No animation yet.</p>
  const scene = scenes[Math.min(idx, scenes.length - 1)]
  const steps: WStep[] = scene.steps.map((s) => ({
    title: s.title, note: s.note,
    body: <div className="scene-body">{s.blocks.map((b, i) => <BlockView key={i} b={b} />)}</div>,
  }))
  return (
    <div>
      {scenes.length > 1 && (
        <div className="seg" role="group" aria-label="Scene">
          {scenes.map((s, i) => <button key={s.id} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)}>{s.title}</button>)}
        </div>
      )}
      {scene.predict && <Predict key={`predict-${scene.id}`} {...scene.predict} />}
      <Walkthrough key={`walk-${scene.id}`} steps={steps} resetKey={scene.id} />
    </div>
  )
}
