import { useMemo, useState } from 'react'
import { Timeline, type Step } from '../components/Timeline'
import { Predict } from '../components/Predict'

type Mode = 'naive' | 'oncommit'

function buildSteps(mode: Mode): Step[] {
  if (mode === 'naive') {
    return [
      { lane: 'A', title: 'BEGIN; INSERT order', sql: 'with transaction.atomic():\n    order = Order.objects.create(...)', state: { 'order row': 'uncommitted', queue: '0', task: '—' } },
      { lane: 'A', title: 'Enqueue too early', sql: 'send_confirmation.delay(order.id)   # still inside atomic()', state: { 'order row': 'uncommitted', queue: '1', task: 'waiting' },
        note: 'The message is in the broker immediately. The transaction has not committed yet.' },
      { lane: 'B', title: 'Worker runs the task', sql: 'Order.objects.get(pk=42)  →  DoesNotExist', state: { 'order row': 'uncommitted', queue: '0', task: 'FAILED' }, tone: 'bad',
        note: 'Other connections cannot see an uncommitted row, so the fast worker finds nothing. This is the race that bites everyone.' },
      { lane: 'A', title: 'COMMIT', sql: 'COMMIT;', state: { 'order row': 'visible', queue: '0', task: 'FAILED' }, tone: 'bad',
        note: 'Too late: the task already failed (or burns retries). It works on your laptop because the worker is slower than your commit.' },
    ]
  }
  return [
    { lane: 'A', title: 'BEGIN; INSERT order', sql: 'with transaction.atomic():\n    order = Order.objects.create(...)', state: { 'order row': 'uncommitted', queue: '0', task: '—' } },
    { lane: 'A', title: 'Register the callback', sql: 'transaction.on_commit(lambda: send_confirmation.delay(order.id))', state: { 'order row': 'uncommitted', queue: '0', task: '—' },
      note: 'Nothing is sent yet. Django remembers the callback and will run it only if the transaction commits (it is discarded on rollback).' },
    { lane: 'A', title: 'COMMIT', sql: 'COMMIT;', state: { 'order row': 'visible', queue: '0', task: '—' } },
    { lane: 'A', title: 'Callback enqueues', sql: 'send_confirmation.delay(42)', state: { 'order row': 'visible', queue: '1', task: 'waiting' } },
    { lane: 'B', title: 'Worker runs the task', sql: 'Order.objects.get(pk=42)  →  found', state: { 'order row': 'visible', queue: '0', task: 'done' }, tone: 'good',
      note: 'The row is committed before the message exists, so the worker always sees it. Remaining gap: if the process crashes between COMMIT and .delay(), the job is lost. The outbox pattern closes it by writing the to-do row inside the same transaction.' },
  ]
}

export default function OnCommitViz() {
  const [mode, setMode] = useState<Mode>('naive')
  const steps = useMemo(() => buildSteps(mode), [mode])
  return (
    <div>
      <Predict
        question="Inside transaction.atomic() you call send_confirmation.delay(order.id) before the block ends. A fast worker picks the task up straight away. What does it find?"
        options={['The new order', 'DoesNotExist: the row is not committed yet']} answer={1}
        why="Uncommitted rows are invisible to other connections. Step through the unsafe version, then switch to transaction.on_commit."
      />
      <div className="seg" role="group" aria-label="Enqueue strategy">
        <button className={mode === 'naive' ? 'on' : ''} onClick={() => setMode('naive')}>⚠ .delay() inside atomic()</button>
        <button className={mode === 'oncommit' ? 'on' : ''} onClick={() => setMode('oncommit')}>✔ transaction.on_commit()</button>
      </div>
      <Timeline steps={steps} resetKey={mode} labels={{ A: 'Web request', B: 'Celery worker', DB: 'Database' }} />
    </div>
  )
}
