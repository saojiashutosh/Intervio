import { useState } from 'react'
import { useContent, useProgress } from '../context'
import { CodeBlock } from '../components/CodeBlock'

const SCHEMA = `CREATE TABLE customers (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE categories (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, sku TEXT NOT NULL UNIQUE,
  category_id BIGINT REFERENCES categories(id), name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0), active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE inventory (product_id BIGINT PRIMARY KEY REFERENCES products(id),
  available_qty INTEGER NOT NULL CHECK (available_qty >= 0), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE orders (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_id BIGINT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','cancelled','shipped')),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE order_items (order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0), PRIMARY KEY (order_id, product_id));`

function Exercise({ n, prompt, hint, solution }: { n: number; prompt: string; hint: string; solution: string }) {
  const [step, setStep] = useState(0) // 0 hidden, 1 hint, 2 solution
  const { isDone, toggle } = useProgress()
  const key = `exercise:${n}`
  return (
    <div className={`card ex ${isDone(key) ? 'done' : ''}`}>
      <div className="ex-head">
        <label className="check"><input type="checkbox" checked={isDone(key)} onChange={() => toggle(key)} aria-label={`Exercise ${n} done`} /></label>
        <p><b>{n}.</b> {prompt}</p>
      </div>
      <div className="row">
        {step < 1 && <button className="ghost small" onClick={() => setStep(1)}>Show hint</button>}
        {step < 2 && <button className="ghost small" onClick={() => setStep(2)}>Reveal solution</button>}
        {step > 0 && <button className="ghost small" onClick={() => setStep(0)}>Hide</button>}
      </div>
      {step >= 1 && <p className="callout">💡 {hint}</p>}
      {step >= 2 && <CodeBlock code={solution} lang="sql" title="One valid solution" />}
    </div>
  )
}

export default function PracticePage() {
  const { content } = useContent()
  if (!content) return null
  return (
    <>
      <h1>SQL practice</h1>
      <p className="lead">Solve each one in <code>psql</code> before peeking. Type it — don’t paste it.</p>
      <details className="card"><summary>Practice schema (run once in a fresh PostgreSQL database)</summary><CodeBlock code={SCHEMA} lang="sql" title="schema.sql" /></details>
      {content.exercises.map((e) => <Exercise key={e.n} {...e} />)}

      <h2>System-design drills</h2>
      <p className="muted">Talk through each for 10 minutes using: clarify → estimate → model → architecture → critical flows → operations → trade-offs.</p>
      {content.drills.map((d) => (
        <div key={d.name} className="card drill"><h3>{d.name}</h3><p><b>A strong answer covers:</b> {d.strong}</p></div>
      ))}
    </>
  )
}
