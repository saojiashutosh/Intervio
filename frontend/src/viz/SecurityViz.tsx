import { useState } from 'react'
import { DataTable, Result, type DRow } from '../components/DataTable'
import { Predict } from '../components/Predict'

const CUSTOMERS = [
  { id: 1, email: 'asha@example.com', card: '4111-••••-1111' },
  { id: 2, email: 'ravi@example.com', card: '5500-••••-0004' },
  { id: 3, email: 'meena@example.com', card: '3400-••••-0009' },
]
const PAYLOADS = [
  { label: 'A normal email', value: 'asha@example.com' },
  { label: "Injection: ' OR '1'='1", value: "' OR '1'='1" },
]

function SqlInjection() {
  const [safe, setSafe] = useState(false)
  const [input, setInput] = useState(PAYLOADS[1].value)
  const built = `SELECT * FROM customers WHERE email = '${input}';`
  const injected = !safe && /'\s*or\s*'1'\s*=\s*'1/i.test(input)
  const matched = safe ? CUSTOMERS.filter((c) => c.email === input) : injected ? CUSTOMERS : CUSTOMERS.filter((c) => c.email === input)
  const rows: DRow[] = CUSTOMERS.map((c) => ({ id: c.id, cells: [c.id, c.email, c.card], tone: matched.includes(c) ? (injected ? 'bad' : 'good') : undefined }))
  return (
    <div>
      <div className="seg" role="group" aria-label="How the query is built">
        <button className={!safe ? 'on' : ''} onClick={() => setSafe(false)}>⚠ String concatenation</button>
        <button className={safe ? 'on' : ''} onClick={() => setSafe(true)}>✔ Parameterized query</button>
      </div>
      <div className="viz-row">
        {PAYLOADS.map((p) => <button key={p.label} className={`chipbtn ${input === p.value ? 'on' : ''}`} onClick={() => setInput(p.value)}>{p.label}</button>)}
      </div>
      <p className="small muted">The user types this into a login or search box:</p>
      <pre className="codebox">{input}</pre>
      <p className="small muted">{safe ? 'The statement and the value travel separately:' : 'The database receives this one string:'}</p>
      <pre className="codebox">{safe ? `SELECT * FROM customers WHERE email = %s;\nparams = [${JSON.stringify(input)}]` : built}</pre>
      <DataTable title={`customers: ${matched.length} row(s) returned`} cols={['id', 'email', 'card']} rows={rows} />
      <Result tone={injected ? 'bad' : 'good'}>{injected
        ? 'The input closed the quote and added OR \'1\'=\'1\', which is always true. Every customer leaked. Django\'s ORM never builds SQL this way, but raw() with an f-string does.'
        : safe ? 'The value is sent as data, never parsed as SQL, so the payload is just an email that matches nobody.'
          : 'A normal input works, so this bug passes every happy-path test. That is what makes it dangerous.'}</Result>
    </div>
  )
}

const ORDERS = [
  { id: 1, owner: 'Asha', item: 'Keyboard', total: 1500 },
  { id: 2, owner: 'Ravi', item: 'Monitor', total: 9000 },
  { id: 3, owner: 'Asha', item: 'Mouse', total: 800 },
]

function Idor() {
  const [scoped, setScoped] = useState(false)
  const [id, setId] = useState(2)
  const order = ORDERS.find((o) => o.id === id)
  const allowed = !!order && order.owner === 'Asha'
  const leak = !scoped && !!order && !allowed
  return (
    <div>
      <p>You are logged in as <b>Asha</b>. Her orders are #1 and #3. She edits the URL to ask for someone else's order.</p>
      <div className="seg" role="group" aria-label="Authorization">
        <button className={!scoped ? 'on' : ''} onClick={() => setScoped(false)}>⚠ Only checks "is logged in"</button>
        <button className={scoped ? 'on' : ''} onClick={() => setScoped(true)}>✔ Authorizes the object</button>
      </div>
      <div className="viz-row">
        {ORDERS.map((o) => <button key={o.id} className={`chipbtn ${id === o.id ? 'on' : ''}`} onClick={() => setId(o.id)}>GET /orders/{o.id}</button>)}
      </div>
      <pre className="codebox">{scoped
        ? 'get_object_or_404(Order, pk=pk, customer__user=request.user)'
        : 'Order.objects.get(pk=pk)   # no owner check'}</pre>
      <DataTable title="response" cols={['status', 'body']} rows={[{ id: 'r', cells: scoped && !allowed ? [404, '{"detail": "Not found"}'] : order ? [200, `${order.item} · ₹${order.total} · owner ${order.owner}`] : [404, 'Not found'], tone: leak ? 'bad' : 'good' }]} />
      <Result tone={leak ? 'bad' : 'good'}>{leak
        ? `Asha just read ${order?.owner}'s order. Authentication proved who she is, but nothing checked that this object is hers (IDOR).`
        : scoped && !allowed ? 'The queryset is scoped to the current user, so someone else\'s order does not exist as far as she is concerned (404, which also avoids confirming it exists).'
          : 'Her own order: allowed.'}</Result>
    </div>
  )
}

export default function SecurityViz() {
  const [tab, setTab] = useState<'sqli' | 'idor'>('sqli')
  return (
    <div>
      <Predict
        question="In Django, which of these is vulnerable to SQL injection?"
        options={['Customer.objects.filter(email=email)', 'Customer.objects.raw(f"... WHERE email = \'{email}\'")']} answer={1}
        why="The ORM sends values as parameters. Building SQL text from user input with an f-string or % formatting is the way back in. Try both attacks below."
      />
      <div className="seg" role="group" aria-label="Attack">
        <button className={tab === 'sqli' ? 'on' : ''} onClick={() => setTab('sqli')}>SQL injection</button>
        <button className={tab === 'idor' ? 'on' : ''} onClick={() => setTab('idor')}>IDOR (broken access control)</button>
      </div>
      {tab === 'sqli' ? <SqlInjection /> : <Idor />}
    </div>
  )
}
