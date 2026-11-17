import { useState } from 'react'
import { Entity, RelLink, Walkthrough, type Attr } from '../../components/Walkthrough'
import { Predict } from '../../components/Predict'
import { DataTable } from '../../components/DataTable'

/* ---------- 1. Anatomy: what each part of the drawing becomes ---------- */

type Part = 'entity' | 'attribute' | 'relationship'
const PARTS: Record<Part, { title: string; becomes: string; code: string }> = {
  entity: { title: 'Entity: a thing you keep records about', becomes: 'Becomes a TABLE. Each real-world instance (one customer) is one ROW.', code: 'CREATE TABLE customers (...);\nCREATE TABLE orders (...);' },
  attribute: { title: 'Attribute: a fact about the thing', becomes: 'Becomes a COLUMN with a data type. Pick a primary key among them.', code: 'id bigint PRIMARY KEY,\nname text NOT NULL,\nplaced_at timestamptz NOT NULL' },
  relationship: { title: 'Relationship: how two things connect', becomes: 'Becomes a FOREIGN KEY column on the "many" side (or a junction table if many-to-many).', code: 'orders.customer_id bigint\n  REFERENCES customers(id)' },
}

export function ErAnatomy() {
  const [p, setP] = useState<Part>('entity')
  const cust: Attr[] = [{ n: 'id', k: 'PK' }, { n: 'name' }, { n: 'email', k: 'UQ' }]
  const ord: Attr[] = [{ n: 'id', k: 'PK' }, { n: 'customer_id', k: 'FK' }, { n: 'placed_at' }, { n: 'total' }]
  return (
    <div>
      <div className="seg" role="group" aria-label="Part of the drawing">
        {(['entity', 'attribute', 'relationship'] as Part[]).map((x) => <button key={x} className={p === x ? 'on' : ''} onClick={() => setP(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}
      </div>
      <div className="erow" aria-label="Example drawing">
        <Entity name="Customer" attrs={cust} hl={p === 'entity'} hlAttr={p === 'attribute'} />
        <RelLink verb="places" card="1 ─── N" hl={p === 'relationship'} />
        <Entity name="Order" attrs={ord} hl={p === 'entity'} hlAttr={p === 'attribute'} />
      </div>
      <p><b>{PARTS[p].title}</b></p>
      <p>{PARTS[p].becomes}</p>
      <pre className="miniCode">{PARTS[p].code}</pre>
    </div>
  )
}

/* ---------- 2. Crow's-foot notation ---------- */

type End = 'one' | 'zeroOne' | 'oneMany' | 'zeroMany'
const ENDS: { id: End; label: string; phrase: string }[] = [
  { id: 'one', label: 'Exactly one', phrase: 'exactly one' },
  { id: 'zeroOne', label: 'Zero or one', phrase: 'zero or one' },
  { id: 'oneMany', label: 'One or many', phrase: 'one or more' },
  { id: 'zeroMany', label: 'Zero or many', phrase: 'zero or more' },
]
const isMany = (e: End) => e === 'oneMany' || e === 'zeroMany'
const isOptional = (e: End) => e === 'zeroOne' || e === 'zeroMany'

/** Draws one end of a relationship line. x is the tip next to the entity; dir is +1 (line goes right) or -1. */
function EndGlyph({ x, dir, kind }: { x: number; dir: 1 | -1; kind: End }) {
  const y = 30, s = { stroke: 'currentColor', strokeWidth: 2, fill: 'none' }
  const bar = (dx: number) => <line x1={x + dir * dx} y1={y - 11} x2={x + dir * dx} y2={y + 11} {...s} />
  const crow = <><line x1={x} y1={y - 11} x2={x + dir * 16} y2={y} {...s} /><line x1={x} y1={y + 11} x2={x + dir * 16} y2={y} {...s} /><line x1={x} y1={y} x2={x + dir * 16} y2={y} {...s} /></>
  const circle = (dx: number) => <circle cx={x + dir * dx} cy={y} r={5} {...s} fill="var(--surface)" />
  if (kind === 'one') return <>{bar(10)}{bar(18)}</>
  if (kind === 'zeroOne') return <>{bar(10)}{circle(21)}</>
  if (kind === 'oneMany') return <>{crow}{bar(22)}</>
  return <>{crow}{circle(26)}</>
}

export function ErNotation() {
  const [left, setLeft] = useState<End>('one')
  const [right, setRight] = useState<End>('zeroMany')
  // The symbol next to an entity says how many OF THAT entity relate to one of the other.
  const type = isMany(left) && isMany(right) ? 'many-to-many' : isMany(right) ? 'one-to-many' : isMany(left) ? 'many-to-one' : 'one-to-one'
  const fk = type === 'many-to-many'
    ? 'Junction table with two foreign keys (customer_id, order_id) and a composite primary key.'
    : type === 'one-to-many'
      ? `Foreign key on Order: order.customer_id${isOptional(left) ? ' (nullable: an order may have no customer)' : ' NOT NULL (every order must have a customer)'}.`
      : type === 'many-to-one'
        ? `Foreign key on Customer: customer.order_id${isOptional(right) ? ' (nullable)' : ' NOT NULL'}. Usually you drew it backwards: flip it.`
        : 'Foreign key on either side, with a UNIQUE constraint so only one row can point at it.'
  const picker = (value: End, set: (e: End) => void, label: string) => (
    <div className="picker"><span className="muted small">{label}</span>
      <div className="seg" role="group" aria-label={label}>{ENDS.map((e) => <button key={e.id} className={value === e.id ? 'on' : ''} onClick={() => set(e.id)}>{e.label}</button>)}</div>
    </div>
  )
  return (
    <div>
      {picker(left, setLeft, 'Symbol next to Customer')}
      {picker(right, setRight, 'Symbol next to Order')}
      <svg viewBox="0 0 400 60" className="notation" role="img" aria-label="Relationship line between Customer and Order">
        <text x="2" y="34" className="svgtext">Customer</text>
        <text x="398" y="34" textAnchor="end" className="svgtext">Order</text>
        <line x1="96" y1="30" x2="304" y2="30" stroke="currentColor" strokeWidth="2" />
        <EndGlyph x={96} dir={1} kind={left} />
        <EndGlyph x={304} dir={-1} kind={right} />
      </svg>
      <p className="read">Read it: each Customer has <b>{ENDS.find((e) => e.id === right)!.phrase}</b> Order{isMany(right) ? 's' : ''}; each Order has <b>{ENDS.find((e) => e.id === left)!.phrase}</b> Customer{isMany(left) ? 's' : ''}.</p>
      <p><b>Type:</b> {type}. <b>Table design:</b> {fk}</p>
      <p className="muted small">Memory trick: the symbol sits next to the entity it counts. The bar means "at least one", the circle means "zero is allowed", and the fork means "many".</p>
    </div>
  )
}

/* ---------- 3. Designing a schema, step by step ---------- */

const memberA: Attr[] = [{ n: 'id', k: 'PK' }, { n: 'name' }, { n: 'email', k: 'UQ' }]
const bookA: Attr[] = [{ n: 'id', k: 'PK' }, { n: 'title' }, { n: 'isbn', k: 'UQ' }]
const authorA: Attr[] = [{ n: 'id', k: 'PK' }, { n: 'name' }]
const plain = (a: Attr[]) => a.filter((x) => !x.k || x.k === 'UQ').map((x) => ({ n: x.n }))

export function ErDesign() {
  return (
    <Walkthrough
      resetKey="erdesign"
      steps={[
        {
          title: 'Read the requirements and underline',
          note: 'Nouns are candidate entities (blue). Verbs are candidate relationships (orange). Facts you will store are attributes.',
          body: (
            <blockquote className="req">
              <span className="n">Members</span> <span className="v">borrow</span> <span className="n">books</span>. Each <span className="n">book</span> has a title and an ISBN and is <span className="v">written by</span> one or more <span className="n">authors</span>. A <span className="n">member</span> can borrow many books over time, and each <span className="n">loan</span> has a due date.
            </blockquote>
          ),
        },
        {
          title: 'Draw the entities',
          note: 'Three obvious entities: Member, Book, Author. "Loan" is not drawn yet. It is hiding inside the verb "borrow".',
          body: <div className="erow"><Entity name="Member" attrs={plain(memberA)} /><Entity name="Book" attrs={plain(bookA)} /><Entity name="Author" attrs={plain(authorA)} /></div>,
        },
        {
          title: 'Connect them and count both directions',
          note: 'Ask both questions for each pair. Both answers are "many", so both relationships are many-to-many. A foreign key cannot hold that.',
          body: (
            <div className="erow">
              <Entity name="Member" attrs={plain(memberA)} />
              <RelLink verb="borrows" card="N ─── M" hl />
              <Entity name="Book" attrs={plain(bookA)} />
              <RelLink verb="written by" card="M ─── N" hl />
              <Entity name="Author" attrs={plain(authorA)} />
            </div>
          ),
        },
        {
          title: 'Spot facts that belong to the relationship',
          note: 'The due date is not a fact about a member or a book. It describes one borrowing. So "borrows" becomes its own entity, Loan. "Written by" has no extra facts, so a plain junction table is enough.',
          body: (
            <div className="erow">
              <Entity name="Member" attrs={plain(memberA)} dim />
              <RelLink card="1 ─── N" hl />
              <Entity name="Loan" attrs={[{ n: 'borrowed_on' }, { n: 'due_date' }, { n: 'returned_on' }]} hl />
              <RelLink card="N ─── 1" hl />
              <Entity name="Book" attrs={plain(bookA)} dim />
            </div>
          ),
        },
        {
          title: 'Add primary and foreign keys',
          note: 'Every many-to-many is replaced by a middle table holding two foreign keys. Loan gets its own id because a member may borrow the same book twice.',
          body: (
            <div className="erow wrap">
              <Entity name="members" attrs={memberA} />
              <Entity name="loans" attrs={[{ n: 'id', k: 'PK' }, { n: 'member_id', k: 'FK' }, { n: 'book_id', k: 'FK' }, { n: 'due_date' }]} hl />
              <Entity name="books" attrs={bookA} />
              <Entity name="book_authors" attrs={[{ n: 'book_id', k: 'FK' }, { n: 'author_id', k: 'FK' }, { n: '(both = composite PK)' }]} hl />
              <Entity name="authors" attrs={authorA} />
            </div>
          ),
        },
        {
          title: 'Check it against the rules',
          note: 'No fact is stored twice, every table has a key, and every relationship is a foreign key. Now you can write the models.',
          body: (
            <DataTable
              title="Checklist"
              cols={['Rule', 'Result']}
              rows={[
                { id: 1, cells: ['Each fact stored once?', 'Yes: author name lives only in authors'], tone: 'good' },
                { id: 2, cells: ['Every table has a primary key?', 'Yes (book_authors uses a composite key)'], tone: 'good' },
                { id: 3, cells: ['Many-to-many resolved?', 'Yes: loans and book_authors'], tone: 'good' },
                { id: 4, cells: ['Fact about the pairing stored on the pairing?', 'Yes: due_date lives on loans'], tone: 'good' },
              ]}
            />
          ),
        },
      ]}
    />
  )
}

/* ---------- 4. Where does the foreign key go? ---------- */

export function FkSide() {
  return (
    <div>
      <Predict
        question="A Department has many Employees; each Employee is in one Department. Where does the foreign key go?"
        options={['employees.department_id', 'departments.employee_id', 'A junction table']} answer={0}
        why="Put the foreign key on the 'many' side. Each employee row stores one department id. The reverse would need a column holding many values."
      />
      <Predict
        question="A User has exactly one Profile. What do you add to the profiles table?"
        options={['user_id, UNIQUE', 'user_id with no constraint', 'A junction table']} answer={0}
        why="A foreign key alone would allow many profiles per user. UNIQUE on the foreign key is what makes it one-to-one."
      />
      <Predict
        question="A Student takes many Courses and a Course has many Students. What do you create?"
        options={['students.course_id', 'courses.student_id', 'A junction table enrollments(student_id, course_id)']} answer={2}
        why="Neither side can hold 'many' in one column. A third table with one row per pairing solves it, and it can also store facts like grade."
      />
    </div>
  )
}
