import { useMemo, useState } from 'react'
import { Timeline, type Step } from '../components/Timeline'
import { Predict } from '../components/Predict'

type Mode = 'plain' | 'tx'

function buildSteps(mode: Mode): Step[] {
  if (mode === 'plain') {
    return [
      { lane: 'A', title: 'Reserve stock', sql: 'UPDATE inventory SET available_qty = available_qty - 1\nWHERE product_id = 42;   -- autocommit: permanent now', state: { stock: '9', orders: '0', payment: '—' } },
      { lane: 'A', title: 'Create the order', sql: 'INSERT INTO orders (customer_id, status) VALUES (7, \'pending\');   -- autocommit', state: { stock: '9', orders: '1', payment: '—' } },
      { lane: 'A', title: 'Charge the card: fails', sql: 'payment_provider.charge(...)  →  PaymentError', state: { stock: '9', orders: '1', payment: 'FAILED' }, tone: 'bad',
        note: 'The exception ends the request. Every statement above was already committed on its own.' },
      { lane: 'DB', title: 'Inconsistent state', sql: 'stock reduced · order exists · no payment', state: { stock: '9', orders: '1', payment: 'FAILED' }, tone: 'bad',
        note: 'One unit is missing from stock and an unpaid order is sitting there. Nothing can undo the earlier statements automatically. This is why you need a transaction.' },
    ]
  }
  return [
    { lane: 'A', title: 'BEGIN', sql: 'with transaction.atomic():', state: { stock: '10', orders: '0', payment: '—' } },
    { lane: 'A', title: 'Reserve stock', sql: 'UPDATE inventory SET available_qty = available_qty - 1\nWHERE product_id = 42;', state: { stock: '9 (uncommitted)', orders: '0', payment: '—' } },
    { lane: 'DB', title: 'Others still see 10', sql: 'uncommitted changes are invisible to other sessions', state: { stock: '9 (uncommitted)', orders: '0', payment: '—' }, tone: 'good' },
    { lane: 'A', title: 'Create the order', sql: 'INSERT INTO orders (customer_id, status) VALUES (7, \'pending\');', state: { stock: '9 (uncommitted)', orders: '1 (uncommitted)', payment: '—' } },
    { lane: 'A', title: 'Charge the card: fails', sql: 'payment_provider.charge(...)  →  PaymentError', state: { stock: '9 (uncommitted)', orders: '1 (uncommitted)', payment: 'FAILED' }, tone: 'bad',
      note: 'The exception propagates out of the atomic() block.' },
    { lane: 'A', title: 'ROLLBACK (automatic)', sql: 'ROLLBACK;', state: { stock: '10', orders: '0', payment: 'FAILED' }, tone: 'good',
      note: 'Atomicity: all steps happen or none do. Stock is back to 10 and no order exists. One honest limit: ACID covers YOUR database only. If the card had been charged before the exception, the transaction could not un-charge it; that needs idempotency keys and reconciliation.' },
  ]
}

export default function AtomicViz() {
  const [mode, setMode] = useState<Mode>('plain')
  const steps = useMemo(() => buildSteps(mode), [mode])
  return (
    <div>
      <Predict
        question="You reserve stock (autocommit), create the order, and then the payment call raises an exception. With NO transaction, what does the database contain afterwards?"
        options={['Everything rolled back automatically', 'Stock reduced and an order, but no payment']} answer={1}
        why="Without BEGIN, each statement commits immediately. There is nothing to roll back. Step through the unsafe version, then wrap the steps in a transaction."
      />
      <div className="seg" role="group" aria-label="Transaction">
        <button className={mode === 'plain' ? 'on' : ''} onClick={() => setMode('plain')}>⚠ Separate statements</button>
        <button className={mode === 'tx' ? 'on' : ''} onClick={() => setMode('tx')}>✔ transaction.atomic()</button>
      </div>
      <Timeline steps={steps} resetKey={mode} lanes={['A', 'DB']} labels={{ A: 'Your app', DB: 'Database' }} />
    </div>
  )
}
