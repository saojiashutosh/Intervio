import { useState } from 'react'
import { DataTable, Result, type DRow } from '../components/DataTable'
import { Predict } from '../components/Predict'

type OnDelete = 'RESTRICT' | 'CASCADE' | 'SET NULL'
interface Cust { id: number; name: string }
interface Ord { id: number; cid: number | null }

const C0: Cust[] = [{ id: 1, name: 'Asha' }, { id: 2, name: 'Ravi' }, { id: 3, name: 'Meena' }]
const O0: Ord[] = [{ id: 101, cid: 1 }, { id: 102, cid: 1 }, { id: 103, cid: 2 }, { id: 104, cid: 3 }]

export default function FkViz() {
  const [custs, setCusts] = useState<Cust[]>(C0)
  const [orders, setOrders] = useState<Ord[]>(O0)
  const [mode, setMode] = useState<OnDelete>('RESTRICT')
  const [newCid, setNewCid] = useState(999)
  const [delCid, setDelCid] = useState(1)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'wait'; text: string } | null>(null)

  function reset() { setCusts(C0); setOrders(O0); setMsg(null) }

  function insertOrder() {
    if (!custs.some((c) => c.id === newCid)) {
      setMsg({ tone: 'bad', text: `INSERT INTO orders (customer_id) VALUES (${newCid});\nERROR:  insert or update on table "orders" violates foreign key constraint "orders_customer_id_fkey"\nDETAIL:  Key (customer_id)=(${newCid}) is not present in table "customers".` })
      return
    }
    const id = Math.max(100, ...orders.map((o) => o.id)) + 1
    setOrders((o) => [...o, { id, cid: newCid }])
    setMsg({ tone: 'good', text: `INSERT INTO orders (customer_id) VALUES (${newCid});\nINSERT 0 1: the reference is valid.` })
  }

  function deleteCustomer() {
    const c = custs.find((x) => x.id === delCid)
    if (!c) { setMsg({ tone: 'wait', text: `Customer ${delCid} no longer exists.` }); return }
    const refs = orders.filter((o) => o.cid === delCid)
    if (refs.length && mode === 'RESTRICT') {
      setMsg({ tone: 'bad', text: `DELETE FROM customers WHERE id = ${delCid};\nERROR:  update or delete on table "customers" violates foreign key constraint "orders_customer_id_fkey" on table "orders"\nDETAIL:  Key (id)=(${delCid}) is still referenced from table "orders".` })
      return
    }
    setCusts((cs) => cs.filter((x) => x.id !== delCid))
    if (mode === 'CASCADE') {
      setOrders((os) => os.filter((o) => o.cid !== delCid))
      setMsg({ tone: refs.length ? 'wait' : 'good', text: `DELETE FROM customers WHERE id = ${delCid};\nDELETE 1, and ${refs.length} order(s) were deleted with it (ON DELETE CASCADE).${refs.length ? '\nGreat for owned children like order_items. Dangerous for financial history.' : ''}` })
    } else if (mode === 'SET NULL') {
      setOrders((os) => os.map((o) => (o.cid === delCid ? { ...o, cid: null } : o)))
      setMsg({ tone: 'wait', text: `DELETE FROM customers WHERE id = ${delCid};\nDELETE 1, and ${refs.length} order(s) now have customer_id = NULL (ON DELETE SET NULL).\nThe orders survive, but you have lost who they belonged to.` })
    } else {
      setMsg({ tone: 'good', text: `DELETE FROM customers WHERE id = ${delCid};\nDELETE 1: nothing referenced this customer, so RESTRICT had nothing to protect.` })
    }
  }

  const custRows: DRow[] = custs.map((c) => ({ id: c.id, cells: [c.id, c.name] }))
  const orderRows: DRow[] = orders.map((o) => ({ id: o.id, cells: [o.id, o.cid], tone: o.cid === null ? 'wait' : undefined }))

  return (
    <div>
      <Predict
        question="You DELETE customer 1, who has 2 orders, and the foreign key is ON DELETE CASCADE. What happens to those 2 orders?"
        options={['They stay, pointing at a customer that no longer exists', 'They are deleted too', 'The DELETE is rejected']} answer={1}
        why="CASCADE propagates the delete to child rows. RESTRICT would reject it, and SET NULL would keep the orders but erase the link. Try all three below."
      />

      <div className="grid2">
        <DataTable title="customers" cols={['id', 'name']} rows={custRows} />
        <DataTable title="orders" cols={['id', 'customer_id → customers.id']} rows={orderRows} />
      </div>

      <div className="viz-row">
        <label className="field">INSERT an order for customer
          <select value={newCid} onChange={(e) => setNewCid(+e.target.value)}>
            {[1, 2, 3, 999].map((n) => <option key={n} value={n}>{n === 999 ? '999 (does not exist)' : n}</option>)}
          </select>
        </label>
        <button className="primary" onClick={insertOrder}>INSERT</button>
      </div>
      <div className="viz-row">
        <label className="field">ON DELETE
          <select value={mode} onChange={(e) => setMode(e.target.value as OnDelete)}>
            <option>RESTRICT</option><option>CASCADE</option><option>SET NULL</option>
          </select>
        </label>
        <label className="field">DELETE customer
          <select value={delCid} onChange={(e) => setDelCid(+e.target.value)}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <button className="danger" onClick={deleteCustomer}>DELETE</button>
        <button className="ghost" onClick={reset}>Reset</button>
      </div>
      {msg && <Result tone={msg.tone}>{msg.text}</Result>}
    </div>
  )
}
