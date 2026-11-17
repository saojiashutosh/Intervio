import { useState } from 'react'
import { DataTable, Result, type DRow } from '../components/DataTable'
import { Predict } from '../components/Predict'

interface Row { id: number; sku: string | null; name: string | null; price: number; qty: number }
type Draft = Omit<Row, 'id'>

const PRESETS: { label: string; row: Draft }[] = [
  { label: 'A valid product', row: { sku: 'SKU-1', name: 'Keyboard', price: 1500, qty: 10 } },
  { label: 'Duplicate SKU', row: { sku: 'SKU-1', name: 'Keyboard v2', price: 1200, qty: 5 } },
  { label: 'Missing name', row: { sku: 'SKU-9', name: null, price: 999, qty: 1 } },
  { label: 'Negative price', row: { sku: 'SKU-7', name: 'Mouse', price: -50, qty: 3 } },
  { label: 'Negative stock', row: { sku: 'SKU-8', name: 'Monitor', price: 9000, qty: -4 } },
]

/** First violated rule for `row` given the rows that came before it, or null. Mirrors PostgreSQL's wording. */
function violation(row: Draft, before: Row[]): string | null {
  if (row.name === null) return 'null value in column "name" violates not-null constraint'
  if (row.sku === null) return 'null value in column "sku" violates not-null constraint'
  if (row.price < 0) return 'new row for relation "products" violates check constraint "products_price_check"'
  if (row.qty < 0) return 'new row for relation "products" violates check constraint "products_qty_check"'
  if (before.some((r) => r.sku === row.sku)) return `duplicate key value violates unique constraint "products_sku_key"\nDETAIL:  Key (sku)=(${row.sku}) already exists.`
  return null
}

const fmt = (d: Draft) => `('${d.sku ?? 'NULL'}', ${d.name === null ? 'NULL' : `'${d.name}'`}, ${d.price}, ${d.qty})`

export default function ConstraintsViz() {
  const [enforce, setEnforce] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)

  const bad = rows.filter((r, i) => violation(r, rows.slice(0, i)))

  function insert(d: Draft) {
    const err = violation(d, rows)
    const stmt = `INSERT INTO products (sku, name, price, qty) VALUES ${fmt(d)};`
    if (err && enforce) { setMsg({ tone: 'bad', text: `${stmt}\nERROR:  ${err}` }); return }
    setRows((r) => [...r, { ...d, id: Math.max(0, ...r.map((x) => x.id)) + 1 }])
    setMsg(err ? { tone: 'bad', text: `${stmt}\nINSERT 0 1: accepted, but the row is invalid (${err.split('\n')[0]}).` } : { tone: 'good', text: `${stmt}\nINSERT 0 1` })
  }
  const reset = () => { setRows([]); setMsg(null) }

  const tableRows: DRow[] = rows.map((r, i) => ({ id: r.id, cells: [r.sku, r.name, r.price, r.qty], tone: violation(r, rows.slice(0, i)) ? 'bad' : undefined }))

  return (
    <div>
      <Predict
        question="Your serializer rejects negative prices, but a one-off script inserts a product with price = -50 straight into the database. What stops it?"
        options={['The serializer validation', 'A CHECK (price >= 0) constraint', 'Nothing: it goes in']} answer={1}
        why="Application validation only protects the paths that use it. Constraints protect the data itself, against scripts, other services and race conditions. Compare ON and OFF below."
      />
      <div className="seg" role="group" aria-label="Constraints">
        <button className={enforce ? 'on' : ''} onClick={() => { setEnforce(true); reset() }}>✔ Constraints ON</button>
        <button className={!enforce ? 'on' : ''} onClick={() => { setEnforce(false); reset() }}>⚠ Constraints OFF</button>
      </div>
      <pre className="codebox">{`products(sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,\n         price NUMERIC CHECK (price >= 0), qty INT CHECK (qty >= 0))`}</pre>
      <div className="viz-row">
        {PRESETS.map((p) => <button key={p.label} className="ghost" onClick={() => insert(p.row)}>{p.label}</button>)}
        <button className="ghost" onClick={reset}>Reset</button>
      </div>
      <DataTable title="products" cols={['sku', 'name', 'price', 'qty']} rows={tableRows} />
      <p className="chip big">invalid rows stored: <b>{bad.length}</b></p>
      {msg && <Result tone={msg.tone}>{msg.text}</Result>}
    </div>
  )
}
