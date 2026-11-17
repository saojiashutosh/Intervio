import { useMemo, useState } from 'react'
import { Timeline, type Step } from '../components/Timeline'
import { Predict } from '../components/Predict'

type Mode = 'early' | 'oncommit'

function buildSteps(mode: Mode): Step[] {
  if (mode === 'early') {
    return [
      { lane: 'A', title: 'Writer: update price', sql: 'BEGIN;  UPDATE products SET price = 650 WHERE id = 42;', state: { 'db (committed)': '500', cache: '500' } },
      { lane: 'A', title: 'Invalidate the cache too early', sql: 'cache.delete("product:42")   # still inside the transaction', state: { 'db (committed)': '500', cache: 'empty' },
        note: 'The cache is cleared, but the new price is not committed yet, so no other connection can see it.' },
      { lane: 'B', title: 'Reader: cache miss', sql: 'SELECT price FROM products WHERE id = 42  →  500\ncache.set("product:42", 500)', state: { 'db (committed)': '500', cache: '500' }, tone: 'bad',
        note: 'The reader repopulates the cache from the only version it can see: the old price.' },
      { lane: 'A', title: 'Writer: COMMIT', sql: 'COMMIT;', state: { 'db (committed)': '650', cache: '500 (STALE)' }, tone: 'bad',
        note: 'The database says 650, the cache says 500, and nothing will fix it until the TTL expires. Customers see the wrong price.' },
    ]
  }
  return [
    { lane: 'A', title: 'Writer: update price', sql: 'BEGIN;  UPDATE products SET price = 650 WHERE id = 42;', state: { 'db (committed)': '500', cache: '500' } },
    { lane: 'A', title: 'Register the invalidation', sql: 'transaction.on_commit(lambda: cache.delete("product:42"))', state: { 'db (committed)': '500', cache: '500' },
      note: 'Nothing happens yet. Django runs the callback only after a successful COMMIT.' },
    { lane: 'A', title: 'Writer: COMMIT', sql: 'COMMIT;', state: { 'db (committed)': '650', cache: '500 (about to be cleared)' } },
    { lane: 'A', title: 'on_commit callback runs', sql: 'cache.delete("product:42")', state: { 'db (committed)': '650', cache: 'empty' } },
    { lane: 'B', title: 'Reader: cache miss', sql: 'SELECT price FROM products WHERE id = 42  →  650\ncache.set("product:42", 650)', state: { 'db (committed)': '650', cache: '650' }, tone: 'good',
      note: 'The new price is visible before the cache is cleared, so any later reader refills the cache with the right value. A short TTL remains a good backstop.' },
  ]
}

export default function CacheViz() {
  const [mode, setMode] = useState<Mode>('early')
  const steps = useMemo(() => buildSteps(mode), [mode])
  return (
    <div>
      <Predict
        question="You update a product price inside a transaction and delete its cache key BEFORE committing. A reader arrives between the delete and the commit. What ends up in the cache?"
        options={['The new price', 'The old price, and it stays stale']} answer={1}
        why="The reader can only see committed data, which is still the old price, and it caches that. Step through it, then move the invalidation to on_commit."
      />
      <div className="seg" role="group" aria-label="When to invalidate">
        <button className={mode === 'early' ? 'on' : ''} onClick={() => setMode('early')}>⚠ Invalidate before commit</button>
        <button className={mode === 'oncommit' ? 'on' : ''} onClick={() => setMode('oncommit')}>✔ Invalidate on_commit</button>
      </div>
      <Timeline steps={steps} resetKey={mode} labels={{ A: 'Writer', B: 'Reader', DB: 'Database & cache' }} lanes={['A', 'DB', 'B']} />
    </div>
  )
}
