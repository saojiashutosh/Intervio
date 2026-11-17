import { Link } from 'react-router-dom'
import { useContent } from '../context'

/** Numbered citation markers, e.g. [3][7], each linking to that source on the Sources page. */
export function Cite({ keys }: { keys: string[] }) {
  const { content } = useContent()
  if (!content) return null
  return (
    <span className="cites">
      {keys.map((k) => {
        const i = content.sources.findIndex((s) => s.key === k)
        const s = content.sources[i]
        if (!s) return null
        return (
          <Link key={k} to={`/sources#${k}`} className={`cite ${s.checked}`} title={`${s.title} (${s.publisher}) · ${s.checked === 'read' ? 'read directly' : 'search summary only'}`}>
            {i + 1}
          </Link>
        )
      })}
    </span>
  )
}

/** "Solid" if at least one cited source was read in full; otherwise flagged as unverified. */
export function Evidence({ keys }: { keys: string[] }) {
  const { content } = useContent()
  if (!content) return null
  const solid = keys.some((k) => content.sources.find((s) => s.key === k)?.checked === 'read')
  return solid
    ? <span className="badge ok" title="At least one cited source was read in full">read</span>
    : <span className="badge warn" title="Only search-result summaries were available for these sources">unverified</span>
}
