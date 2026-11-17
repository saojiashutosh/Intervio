import { useEffect, useRef, useState } from 'react'
import { DataTable, Result, type DRow } from '../components/DataTable'
import { Predict } from '../components/Predict'
import { NormalForms } from './NormalForms'

interface Flat { id: string; customer: string; city: string; product: string }
const FLAT0: Flat[] = [
  { id: 'o1', customer: 'Asha', city: 'Mumbai', product: 'Keyboard' },
  { id: 'o2', customer: 'Asha', city: 'Mumbai', product: 'Mouse' },
  { id: 'o3', customer: 'Ravi', city: 'Delhi', product: 'Monitor' },
  { id: 'o4', customer: 'Asha', city: 'Mumbai', product: 'Laptop' },
  { id: 'o5', customer: 'Asha', city: 'Mumbai', product: 'Cable' },
]
const CUST0: Record<string, string> = { Asha: 'Mumbai', Ravi: 'Delhi' }

export default function NormalizeViz() {
  const [tab, setTab] = useState<'anomalies' | 'forms'>('anomalies')
  return (
    <div>
      <div className="seg" role="group" aria-label="Normalization view">
        <button className={tab === 'anomalies' ? 'on' : ''} onClick={() => setTab('anomalies')}>1. See the anomalies</button>
        <button className={tab === 'forms' ? 'on' : ''} onClick={() => setTab('forms')}>2. Climb the normal forms (1NF → 5NF)</button>
      </div>
      {tab === 'anomalies' ? <Anomalies /> : <NormalForms />}
    </div>
  )
}

function Anomalies() {
  const [normalized, setNormalized] = useState(false)
  const [flat, setFlat] = useState<Flat[]>(FLAT0)
  const [cust, setCust] = useState<Record<string, string>>(CUST0)
  const [orders, setOrders] = useState(FLAT0.map(({ id, customer, product }) => ({ id, customer, product })))
  const [crash, setCrash] = useState(true)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'wait'; text: string } | null>(null)
  const timers = useRef<number[]>([])

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => clear, [])
  function reset() { clear(); setFlat(FLAT0); setCust(CUST0); setOrders(FLAT0.map(({ id, customer, product }) => ({ id, customer, product }))); setMsg(null) }
  useEffect(() => { reset() }, [normalized]) // eslint-disable-line react-hooks/exhaustive-deps

  function moveAsha() {
    reset()
    if (normalized) {
      setCust((c) => ({ ...c, Asha: 'Pune' }))
      setMsg({ tone: 'good', text: 'UPDATE customers SET city = \'Pune\' WHERE name = \'Asha\';\n1 row changed. Every order sees the new city through the join.' })
      return
    }
    const targets = FLAT0.filter((r) => r.customer === 'Asha')
    setMsg({ tone: 'wait', text: 'UPDATE orders SET city = \'Pune\' WHERE id = …   (one row at a time)' })
    targets.forEach((t, k) => {
      timers.current.push(window.setTimeout(() => {
        if (crash && k >= 3) {
          if (k === 3) setMsg({ tone: 'bad', text: 'The app crashed after 3 rows.\nAsha now lives in Pune AND in Mumbai: an update anomaly.' })
          return
        }
        setFlat((rows) => rows.map((r) => (r.id === t.id ? { ...r, city: 'Pune' } : r)))
        if (k === targets.length - 1) setMsg({ tone: 'good', text: `All ${targets.length} rows updated. It worked, but you had to touch ${targets.length} rows and any one missed row is a bug.` })
      }, 500 * (k + 1)))
    })
  }

  function deleteRavi() {
    clear()
    if (normalized) {
      setOrders((o) => o.filter((r) => r.id !== 'o3'))
      setMsg({ tone: 'good', text: 'DELETE FROM orders WHERE id = \'o3\';\nRavi is still in customers. We still know who he is and where he lives.' })
    } else {
      setFlat((rows) => rows.filter((r) => r.id !== 'o3'))
      setMsg({ tone: 'bad', text: 'DELETE FROM orders WHERE id = \'o3\';\nRavi\'s only order is gone and so is everything we knew about him: a delete anomaly.' })
    }
  }

  const ashaCities = new Set(flat.filter((r) => r.customer === 'Asha').map((r) => r.city))
  const inconsistent = ashaCities.size > 1
  const flatRows: DRow[] = flat.map((r) => ({
    id: r.id, cells: [r.id, r.customer, r.city, r.product],
    tone: r.customer === 'Asha' && r.city === 'Pune' ? (inconsistent ? 'changed' : 'good') : r.customer === 'Asha' && inconsistent ? 'bad' : undefined,
  }))
  const custRows: DRow[] = Object.entries(cust).map(([name, city], i) => ({ id: name, cells: [`c${i + 1}`, name, city], tone: city === 'Pune' ? 'good' : undefined }))
  const cid = (name: string) => `c${Object.keys(CUST0).indexOf(name) + 1}`
  const orderRows: DRow[] = orders.map((r) => ({ id: r.id, cells: [r.id, cid(r.customer), r.product] }))

  return (
    <div>
      <Predict
        question="Asha's city is stored on 4 rows of a flat orders table. She moves to Pune, but the app crashes after updating 3 rows. What does the database now say about her city?"
        options={['Pune', 'Mumbai', 'Both, depending on the row']} answer={2}
        why="Copies of the same fact drift apart. Normalization stores each fact once. Try both versions below."
      />
      <div className="seg" role="group" aria-label="Design">
        <button className={!normalized ? 'on' : ''} onClick={() => setNormalized(false)}>Flat table</button>
        <button className={normalized ? 'on' : ''} onClick={() => setNormalized(true)}>Normalized (3NF)</button>
      </div>

      <div className="viz-row">
        <button className="primary" onClick={moveAsha}>Asha moves to Pune</button>
        <button className="ghost" onClick={deleteRavi}>Delete Ravi's only order</button>
        {!normalized && <label className="check"><input type="checkbox" checked={crash} onChange={(e) => setCrash(e.target.checked)} /> app crashes midway</label>}
        <button className="ghost" onClick={reset}>Reset</button>
      </div>

      {normalized ? (
        <div className="grid2">
          <DataTable title="customers" cols={['id', 'name', 'city']} rows={custRows} note="city stored once" />
          <DataTable title="orders" cols={['order', 'customer_id', 'product']} rows={orderRows} note="customer_id points at customers" />
        </div>
      ) : (
        <DataTable title="orders (flat: customer data repeated on every row)" cols={['order', 'customer', 'city', 'product']} rows={flatRows} />
      )}
      {msg && <Result tone={msg.tone}>{msg.text}</Result>}
    </div>
  )
}
