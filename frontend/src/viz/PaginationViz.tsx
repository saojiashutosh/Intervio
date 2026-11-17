import { useState } from 'react'
import { motion } from 'framer-motion'
import { Predict } from '../components/Predict'

const SIZE = 4
const START = Array.from({ length: 12 }, (_, i) => 12 - i) // newest first: 12, 11, ... 1

function Column({ title, sql, pages, dups }: { title: string; sql: string; pages: number[][]; dups: Set<number> }) {
  return (
    <div className="panel">
      <h4>{title}</h4>
      <pre className="codebox">{sql}</pre>
      {pages.map((pg, pi) => (
        <div key={pi} className="pagerow">
          <span className="muted small">page {pi + 1}</span>
          {pg.map((n, k) => <motion.span key={`${pi}-${k}-${n}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`orderchip ${dups.has(n) ? 'dup' : ''}`}>#{n}</motion.span>)}
        </div>
      ))}
      <p className={`small ${dups.size ? 'bad' : 'good'}`}>{dups.size ? `${dups.size} order(s) shown more than once` : 'no duplicates or gaps so far'}</p>
    </div>
  )
}

export default function PaginationViz() {
  const [items, setItems] = useState<number[]>(START)
  const [offsetPages, setOffsetPages] = useState<number[][]>([START.slice(0, SIZE)])
  const [cursorPages, setCursorPages] = useState<number[][]>([START.slice(0, SIZE)])

  function nextPage() {
    setOffsetPages((p) => [...p, items.slice(p.length * SIZE, p.length * SIZE + SIZE)])
    setCursorPages((p) => {
      const last = p[p.length - 1].at(-1) ?? Infinity
      return [...p, items.filter((n) => n < last).slice(0, SIZE)]
    })
  }
  const arrive = () => setItems((it) => [Math.max(...it) + 1, ...it])
  const reset = () => { setItems(START); setOffsetPages([START.slice(0, SIZE)]); setCursorPages([START.slice(0, SIZE)]) }

  const seen = (pages: number[][]) => {
    const s = new Set<number>(); const dups = new Set<number>()
    pages.flat().forEach((n) => { if (s.has(n)) dups.add(n); s.add(n) })
    return dups
  }
  const offDups = seen(offsetPages), curDups = seen(cursorPages)
  const lastOffset = offsetPages.length * SIZE

  return (
    <div>
      <Predict
        question="You load page 1 (the newest 4 orders). Then 3 new orders arrive. You load page 2 using OFFSET 4. What do you get?"
        options={['The next 4 older orders', 'Some orders you already saw on page 1']} answer={1}
        why="New rows shift everything down, so OFFSET 4 now starts inside page 1's data. A cursor remembers the last row you saw, so it is unaffected. Try it."
      />
      <div className="viz-row">
        <button className="primary" onClick={nextPage}>Load next page</button>
        <button className="ghost" onClick={arrive}>A new order arrives</button>
        <button className="ghost" onClick={reset}>Reset</button>
        <span className="chip">orders in the table: <b>{items.length}</b> (newest #{Math.max(...items)})</span>
      </div>
      <div className="grid2">
        <Column title="Offset pagination" sql={`ORDER BY id DESC\nLIMIT ${SIZE} OFFSET ${lastOffset}`} pages={offsetPages} dups={offDups} />
        <Column title="Cursor (keyset) pagination" sql={`WHERE id < ${cursorPages[cursorPages.length - 1].at(-1) ?? '…'}\nORDER BY id DESC LIMIT ${SIZE}`} pages={cursorPages} dups={curDups} />
      </div>
      <p className="muted small">OFFSET also makes the database read and discard every earlier row, so deep pages get slower. A cursor jumps straight to the last-seen position using an index. In DRF that is CursorPagination.</p>
    </div>
  )
}
