import { useState } from 'react'
import { DataTable, Result, type DRow } from '../components/DataTable'
import { Predict } from '../components/Predict'

type Rel = '1-1' | '1-N' | 'N-M'
type Msg = { tone: 'good' | 'bad'; text: string } | null

const META: Record<Rel, { a: string; b: string; label: string; rule: string; becomes: string }> = {
  '1-1': { a: 'User', b: 'Profile', label: '1 ── 1', rule: 'A user has at most one profile.', becomes: 'A foreign key on the dependent table that is also UNIQUE (or is the primary key).' },
  '1-N': { a: 'Customer', b: 'Order', label: '1 ── N', rule: 'A customer places many orders; an order has one customer.', becomes: 'A foreign key on the "many" side pointing at the "one" side.' },
  'N-M': { a: 'Product', b: 'Category', label: 'N ── M', rule: 'A product is in many categories and a category holds many products.', becomes: 'A junction table with two foreign keys and a composite primary key.' },
}

export default function ErViz() {
  const [rel, setRel] = useState<Rel>('1-N')
  const [orders, setOrders] = useState([{ id: 101, cid: 1 }, { id: 102, cid: 1 }, { id: 103, cid: 2 }])
  const [links, setLinks] = useState<[number, number][]>([[1, 10], [1, 11], [2, 11]])
  const [profiles, setProfiles] = useState<number[]>([1])
  const [msg, setMsg] = useState<Msg>(null)

  const choose = (r: Rel) => { setRel(r); setMsg(null) }
  const m = META[rel]

  function addOrder() { setOrders((o) => [...o, { id: Math.max(...o.map((x) => x.id)) + 1, cid: 1 }]); setMsg({ tone: 'good', text: 'INSERT INTO orders (customer_id) VALUES (1);\nMany orders may point at the same customer.' }) }
  function tag() {
    if (links.some(([p, c]) => p === 2 && c === 10)) { setMsg({ tone: 'bad', text: 'INSERT INTO product_categories VALUES (2, 10);\nERROR:  duplicate key value violates unique constraint "product_categories_pkey"\nThe composite primary key means each pair can exist only once.' }); return }
    setLinks((l) => [...l, [2, 10]]); setMsg({ tone: 'good', text: 'INSERT INTO product_categories VALUES (2, 10);\nOne row = one product-category pairing. Click again to see the key reject a duplicate.' })
  }
  function profile(uid: number) {
    if (profiles.includes(uid)) { setMsg({ tone: 'bad', text: `INSERT INTO profiles (user_id) VALUES (${uid});\nERROR:  duplicate key value violates unique constraint "profiles_pkey"\nOne-to-one is enforced by uniqueness on the foreign key.` }); return }
    setProfiles((p) => [...p, uid]); setMsg({ tone: 'good', text: `INSERT INTO profiles (user_id) VALUES (${uid});\nUser ${uid} now has exactly one profile.` })
  }
  const reset = () => { setOrders([{ id: 101, cid: 1 }, { id: 102, cid: 1 }, { id: 103, cid: 2 }]); setLinks([[1, 10], [1, 11], [2, 11]]); setProfiles([1]); setMsg(null) }

  const tables: Record<Rel, React.ReactNode> = {
    '1-1': (<div className="grid2">
      <DataTable title="users" cols={['id', 'email']} rows={[{ id: 1, cells: [1, 'asha@x.com'] }, { id: 2, cells: [2, 'ravi@x.com'] }]} />
      <DataTable title="profiles" cols={['user_id (PK, FK)', 'bio']} rows={profiles.map<DRow>((u) => ({ id: u, cells: [u, 'hello'] }))} />
    </div>),
    '1-N': (<div className="grid2">
      <DataTable title="customers" cols={['id', 'name']} rows={[{ id: 1, cells: [1, 'Asha'] }, { id: 2, cells: [2, 'Ravi'] }]} />
      <DataTable title="orders" cols={['id', 'customer_id (FK)']} rows={orders.map<DRow>((o) => ({ id: o.id, cells: [o.id, o.cid] }))} />
    </div>),
    'N-M': (<div className="grid3">
      <DataTable title="products" cols={['id', 'name']} rows={[{ id: 1, cells: [1, 'Keyboard'] }, { id: 2, cells: [2, 'Mouse'] }]} />
      <DataTable title="product_categories (junction)" cols={['product_id', 'category_id']} rows={links.map<DRow>(([p, c]) => ({ id: `${p}-${c}`, cells: [p, c] }))} />
      <DataTable title="categories" cols={['id', 'name']} rows={[{ id: 10, cells: [10, 'Gaming'] }, { id: 11, cells: [11, 'Office'] }]} />
    </div>),
  }

  return (
    <div>
      <Predict
        question="A product can be in many categories and a category has many products. Which design models that?"
        options={['A category_id column on products', 'A junction table with two foreign keys', 'Comma-separated IDs in a text column']} answer={1}
        why="A single foreign key only gives you one-to-many. Many-to-many always needs a third table with one row per pairing."
      />
      <div className="seg" role="group" aria-label="Relationship type">
        {(['1-1', '1-N', 'N-M'] as Rel[]).map((r) => <button key={r} className={rel === r ? 'on' : ''} onClick={() => choose(r)}>{r === '1-1' ? 'One-to-one' : r === '1-N' ? 'One-to-many' : 'Many-to-many'}</button>)}
      </div>
      <div className="erdiagram" aria-label="Entity relationship">
        <span className="entity">{m.a}</span><span className="rel">{m.label}</span><span className="entity">{m.b}</span>
      </div>
      <p><b>Rule:</b> {m.rule}</p>
      <p><b>Becomes:</b> {m.becomes}</p>
      {tables[rel]}
      <div className="viz-row">
        {rel === '1-N' && <button className="primary" onClick={addOrder}>Add another order for Asha</button>}
        {rel === 'N-M' && <button className="primary" onClick={tag}>Tag Mouse as Gaming</button>}
        {rel === '1-1' && <><button className="primary" onClick={() => profile(2)}>Create a profile for Ravi</button><button className="ghost" onClick={() => profile(1)}>Create a 2nd profile for Asha</button></>}
        <button className="ghost" onClick={reset}>Reset</button>
      </div>
      {msg && <Result tone={msg.tone}>{msg.text}</Result>}
    </div>
  )
}
