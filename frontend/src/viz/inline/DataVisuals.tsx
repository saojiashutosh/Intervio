import { useState } from 'react'
import { DataTable, type DRow } from '../../components/DataTable'
import { Walkthrough } from '../../components/Walkthrough'

/* ---------- Joins: which rows survive ---------- */

type J = 'inner' | 'left' | 'right' | 'full'
const EMP = [{ n: 'Asha', d: 1 }, { n: 'Ravi', d: 1 }, { n: 'Mei', d: null as number | null }]
const DEPT = [{ id: 1, n: 'Engineering' }, { id: 2, n: 'Sales' }]
const JSQL: Record<J, string> = {
  inner: 'SELECT e.name, d.name FROM employees e\nINNER JOIN departments d ON d.id = e.dept_id;',
  left: 'SELECT e.name, d.name FROM employees e\nLEFT JOIN departments d ON d.id = e.dept_id;',
  right: 'SELECT e.name, d.name FROM employees e\nRIGHT JOIN departments d ON d.id = e.dept_id;',
  full: 'SELECT e.name, d.name FROM employees e\nFULL JOIN departments d ON d.id = e.dept_id;',
}
const JEXPL: Record<J, string> = {
  inner: 'Only pairs that match on both sides. Mei has no department and Sales has no employee, so both vanish.',
  left: 'Every row of the LEFT table (employees) is kept. Where nothing matches, the right side is NULL. Mei survives.',
  right: 'Every row of the RIGHT table (departments) is kept. Sales survives with NULL for the employee.',
  full: 'Everything from both sides. Unmatched rows get NULL on the missing side.',
}

export function JoinsViz() {
  const [j, setJ] = useState<J>('inner')
  const rows: DRow[] = []
  for (const e of EMP) {
    const d = DEPT.find((x) => x.id === e.d)
    if (d) rows.push({ id: `m-${e.n}`, cells: [e.n, d.n], tone: 'good' })
    else if (j === 'left' || j === 'full') rows.push({ id: `l-${e.n}`, cells: [e.n, null], tone: 'wait' })
  }
  if (j === 'right' || j === 'full') for (const d of DEPT) if (!EMP.some((e) => e.d === d.id)) rows.push({ id: `r-${d.n}`, cells: [null, d.n], tone: 'wait' })
  return (
    <div>
      <div className="grid2">
        <DataTable title="employees (left)" cols={['name', 'dept_id']} rows={EMP.map((e) => ({ id: e.n, cells: [e.n, e.d], tone: e.d === null && (j === 'inner' || j === 'right') ? 'bad' : undefined }))} />
        <DataTable title="departments (right)" cols={['id', 'name']} rows={DEPT.map((d) => ({ id: d.id, cells: [d.id, d.n], tone: !EMP.some((e) => e.d === d.id) && (j === 'inner' || j === 'left') ? 'bad' : undefined }))} />
      </div>
      <div className="seg" role="group" aria-label="Join type">
        {(['inner', 'left', 'right', 'full'] as J[]).map((x) => <button key={x} className={j === x ? 'on' : ''} onClick={() => setJ(x)}>{x.toUpperCase()} JOIN</button>)}
      </div>
      <pre className="miniCode">{JSQL[j]}</pre>
      <DataTable title={`Result: ${rows.length} rows`} cols={['employee', 'department']} rows={rows} note="Green = matched pair. Amber = kept with NULL. Red rows above were dropped from the result." />
      <p>{JEXPL[j]}</p>
    </div>
  )
}

/* ---------- Normalization: splitting a flat table ---------- */

const FLAT: [number, string, string, string, number, number][] = [
  [1, 'Asha', 'Pune', 'Keyboard', 50, 1],
  [1, 'Asha', 'Pune', 'Mouse', 20, 2],
  [2, 'Ravi', 'Delhi', 'Keyboard', 50, 1],
  [3, 'Asha', 'Pune', 'Mouse', 20, 1],
]

export function DecomposeViz() {
  return (
    <Walkthrough
      resetKey="decompose"
      steps={[
        {
          title: 'Start with one flat table',
          note: 'Everything in one place. Notice the red cells: Asha\'s city and each product price repeat on every row. Every repeat is a chance to disagree later.',
          body: <DataTable title="order_lines" cols={['order_id', 'customer', 'city', 'product', 'price', 'qty']}
            rows={FLAT.map((r, i) => ({ id: i, cells: r, tone: r[1] === 'Asha' || r[3] ? 'bad' : undefined }))} />,
        },
        {
          title: '2NF: move facts that depend on only part of the key',
          note: 'The key is (order_id, product). The price depends on the product alone, not on the order, so it moves to its own table.',
          body: (
            <div className="grid2">
              <DataTable title="products" cols={['product (PK)', 'price']} rows={[{ id: 1, cells: ['Keyboard', 50], tone: 'good' }, { id: 2, cells: ['Mouse', 20], tone: 'good' }]} />
              <DataTable title="order_lines" cols={['order_id', 'customer', 'city', 'product (FK)', 'qty']} rows={FLAT.map((r, i) => ({ id: i, cells: [r[0], r[1], r[2], r[3], r[5]], tone: r[1] === 'Asha' ? 'bad' : undefined }))} />
            </div>
          ),
        },
        {
          title: '3NF: move facts that depend on another non-key column',
          note: 'The city depends on the customer, not on the order line. The customer\'s name and city now live in one row each.',
          body: (
            <div className="grid3">
              <DataTable title="customers" cols={['id (PK)', 'name', 'city']} rows={[{ id: 1, cells: [1, 'Asha', 'Pune'], tone: 'good' }, { id: 2, cells: [2, 'Ravi', 'Delhi'], tone: 'good' }]} />
              <DataTable title="orders" cols={['id (PK)', 'customer_id (FK)']} rows={[{ id: 1, cells: [1, 1] }, { id: 2, cells: [2, 2] }, { id: 3, cells: [3, 1] }]} />
              <DataTable title="order_lines" cols={['order_id', 'product (FK)', 'qty']} rows={FLAT.map((r, i) => ({ id: i, cells: [r[0], r[3], r[5]] }))} />
            </div>
          ),
        },
        {
          title: 'Prove the benefit: Asha moves to Mumbai',
          note: 'Before: four rows could hold the city, and you must find and change every one. After: exactly one row changes, and no disagreement is possible. Joins put the original picture back whenever you need it.',
          body: (
            <div className="grid2">
              <DataTable title="Flat table" cols={['rows to update']} rows={[{ id: 1, cells: ['3 rows contain "Asha, Pune"'], tone: 'bad' }]} />
              <DataTable title="customers (normalized)" cols={['id', 'name', 'city']} rows={[{ id: 1, cells: [1, 'Asha', 'Mumbai'], tone: 'changed' }, { id: 2, cells: [2, 'Ravi', 'Delhi'] }]} note="UPDATE customers SET city = 'Mumbai' WHERE id = 1;  → 1 row" />
            </div>
          ),
        },
      ]}
    />
  )
}

/* ---------- Composite index: the leftmost-prefix rule ---------- */

type Entry = { c: number; s: string; d: string }
const ENTRIES: Entry[] = [
  { c: 1, s: 'paid', d: '01-05' }, { c: 1, s: 'paid', d: '03-02' }, { c: 1, s: 'refunded', d: '02-11' },
  { c: 2, s: 'paid', d: '01-20' }, { c: 2, s: 'paid', d: '02-28' }, { c: 2, s: 'pending', d: '03-09' },
  { c: 3, s: 'paid', d: '01-02' }, { c: 3, s: 'pending', d: '02-14' }, { c: 3, s: 'refunded', d: '03-01' },
]
const QUERIES: { label: string; test: (e: Entry) => boolean; usable: boolean; why: string }[] = [
  { label: 'customer_id = 2', test: (e) => e.c === 2, usable: true, why: 'Uses the first column. All matches sit together, so the database jumps to one block.' },
  { label: "customer_id = 2 AND status = 'paid'", test: (e) => e.c === 2 && e.s === 'paid', usable: true, why: 'Uses the first two columns. Still one contiguous block, and a smaller one.' },
  { label: "status = 'paid'", test: (e) => e.s === 'paid', usable: false, why: 'Skips the first column. Matches are scattered all through the index, so it cannot jump. It must scan every entry.' },
  { label: "customer_id = 2 AND created_at > '02-01'", test: (e) => e.c === 2 && e.d > '02-01', usable: true, why: 'Uses customer_id to find the block, then filters inside it. The gap (status) limits how much of the index is used, but it is still far better than a full scan.' },
]

export function CompositeIndexViz() {
  const [q, setQ] = useState(0)
  const Q = QUERIES[q]
  const hits = ENTRIES.filter(Q.test).length
  return (
    <div>
      <p className="muted small">Index on <code>(customer_id, status, created_at)</code>: entries are stored sorted by the first column, then the second inside it, then the third.</p>
      <div className="seg" role="group" aria-label="Query">{QUERIES.map((x, i) => <button key={x.label} className={q === i ? 'on' : ''} onClick={() => setQ(i)}>{x.label}</button>)}</div>
      <table className="idxtable">
        <thead><tr><th>customer_id</th><th>status</th><th>created_at</th><th /></tr></thead>
        <tbody>
          {ENTRIES.map((e, i) => {
            const m = Q.test(e)
            return <tr key={i} className={m ? (Q.usable ? 'hit' : 'scatter') : ''}><td>{e.c}</td><td>{e.s}</td><td>{e.d}</td><td>{m ? '◀ match' : ''}</td></tr>
          })}
        </tbody>
      </table>
      <p className={`note ${Q.usable ? 'good' : 'bad'}`} role="status"><b>{Q.usable ? 'Index range scan' : 'Full index scan'}</b> · {hits} matching entries. {Q.why}</p>
    </div>
  )
}
