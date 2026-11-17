import { useState } from 'react'
import { motion } from 'framer-motion'
import { DataTable } from '../components/DataTable'
import { Predict } from '../components/Predict'

type Mode = 'derive' | 'snapshot'
const QTY = 2
const OLD = 500
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`

export default function DenormViz() {
  const [mode, setMode] = useState<Mode>('derive')
  const [price, setPrice] = useState(OLD)
  const total = QTY * (mode === 'derive' ? price : OLD)
  const wrong = total !== QTY * OLD

  return (
    <div>
      <Predict
        question="Invoice #1001 was issued last month: 2 × ₹500 = ₹1,000. The catalogue price is now ₹650. You reprint the invoice and compute the total from products.price. What does it show?"
        options={['₹1,000', '₹1,300']} answer={1}
        why="A historical invoice must not depend on today's price. That is why order_items stores a snapshot of unit_price, a deliberate and correct form of denormalization."
      />
      <div className="seg" role="group" aria-label="How the invoice total is computed">
        <button className={mode === 'derive' ? 'on' : ''} onClick={() => setMode('derive')}>⚠ Join to products.price</button>
        <button className={mode === 'snapshot' ? 'on' : ''} onClick={() => setMode('snapshot')}>✔ Snapshot unit_price</button>
      </div>
      <div className="viz-row">
        <button className="primary" onClick={() => setPrice(650)} disabled={price === 650}>Catalogue price rises to ₹650</button>
        <button className="ghost" onClick={() => setPrice(OLD)}>Reset</button>
      </div>
      <div className="grid2">
        <DataTable title="products (current catalogue)" cols={['id', 'name', 'price']} rows={[{ id: 1, cells: [1, 'Keyboard', rupees(price)], tone: price !== OLD ? 'changed' : undefined }]} />
        <DataTable title="order_items" cols={mode === 'snapshot' ? ['order', 'product', 'qty', 'unit_price'] : ['order', 'product', 'qty']}
          rows={[{ id: 1, cells: mode === 'snapshot' ? [1001, 1, QTY, rupees(OLD)] : [1001, 1, QTY] }]} note={mode === 'snapshot' ? 'unit_price copied at purchase time' : 'no price stored: it must be looked up'} />
      </div>
      <motion.div key={`${mode}-${price}`} initial={{ scale: 0.97, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className={`invoice ${wrong ? 'bad' : 'good'}`} role="status">
        <b>Invoice #1001</b> · Keyboard × {QTY} · <b>Total {rupees(total)}</b>
        <p className="small">{wrong
          ? 'The customer was billed ₹1,000 last month; this reprint says ₹1,300. The history has been rewritten.'
          : 'Matches what the customer actually paid.'}</p>
      </motion.div>
      <p className="muted small">The cost of any denormalization: you now own keeping the copy correct. A snapshot is safe because it is written once and never updated; a running total or counter needs a refresh and reconciliation job.</p>
    </div>
  )
}
