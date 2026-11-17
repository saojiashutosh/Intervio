import { useState } from 'react'
import { DataTable, type DRow } from '../components/DataTable'

type FormId = '1NF' | '2NF' | '3NF' | 'BCNF' | '4NF' | '5NF'

const FORMS: { id: FormId; rule: string; hook: string }[] = [
  { id: '1NF', rule: 'Every cell holds one single value. No lists inside a cell, no repeating columns.', hook: 'One value per cell.' },
  { id: '2NF', rule: 'Every non-key column depends on the WHOLE key, not just part of it. (Only matters when the key has several columns.)', hook: 'The whole key.' },
  { id: '3NF', rule: 'Non-key columns depend on the key and nothing else. No column that is really determined by another non-key column.', hook: 'And nothing but the key.' },
  { id: 'BCNF', rule: 'A stricter 3NF: whenever one column determines another, the determining column must itself be a key.', hook: 'Every determinant is a key.' },
  { id: '4NF', rule: 'A table must not hold two independent lists about the same thing. Otherwise every combination has to be stored.', hook: 'No independent lists in one table.' },
  { id: '5NF', rule: 'If a table can be split into smaller tables and joined back to give exactly the same rows, split it. Matters for three-way relationships.', hook: 'No hidden join.' },
]

const AFTER_NOTE: Record<FormId, string> = {
  '1NF': 'Each phone is its own row. You can add a third phone without changing the table, and WHERE phone = ... can use an index.',
  '2NF': 'student_name now depends on the whole key of its own table. Renaming Asha changes one row instead of every enrollment.',
  '3NF': 'Renaming a department is one UPDATE. Before, you had to change every employee row of that department.',
  BCNF: "Each fact now has one home: tutor → subject lives in tutor_subject. The catch: the old table's rule (a student has at most one tutor per subject) is no longer enforced by a key, so you must enforce it another way.",
  '4NF': 'Skills and languages are stored separately, so each grows on its own. 2 + 2 rows instead of 2 × 2, and the gap widens fast: 5 skills and 4 languages is 9 rows against 20.',
  '5NF': 'Three small tables, no redundancy. Warning: this split is only correct because of the stated business rule. If the rule is false, joining the pieces invents rows that were never true.',
}

const WHEN: Record<FormId, string> = {
  '1NF': 'Always. It is the baseline for any relational table. (PostgreSQL arrays and JSONB are deliberate exceptions, used knowingly.)',
  '2NF': 'Always. It shows up whenever a junction table carries extra columns.',
  '3NF': 'The default target for application tables. Interviews expect you to reach it.',
  BCNF: 'Usually reached together with 3NF. It matters only when a table has overlapping candidate keys, which is uncommon.',
  '4NF': 'Rare. Check for it when a table lists two independent sets of things about one entity.',
  '5NF': 'Very rare, mostly academic. Know the idea for interviews, but you will almost never design for it.',
}

function Tables({ id, fixed, extra }: { id: FormId; fixed: boolean; extra: boolean }) {
  switch (id) {
    case '1NF':
      return fixed ? (
        <div className="grid2">
          <DataTable title="students" cols={['id', 'name']} rows={[{ id: 1, cells: [1, 'Asha'], tone: 'good' }, { id: 2, cells: [2, 'Ravi'], tone: 'good' }]} />
          <DataTable title="student_phones" cols={['student_id (FK)', 'phone']} rows={[{ id: 'a', cells: [1, '555-0101'], tone: 'good' }, { id: 'b', cells: [1, '555-0102'], tone: 'good' }, { id: 'c', cells: [2, '555-0199'], tone: 'good' }]} note="One row per phone: searchable, indexable, unlimited" />
        </div>
      ) : (
        <DataTable title="students" cols={['id', 'name', 'phones']} rows={[{ id: 1, cells: [1, 'Asha', '555-0101, 555-0102'], tone: 'bad' }, { id: 2, cells: [2, 'Ravi', '555-0199'] }]} note="A list crammed into one cell: you cannot index it, enforce uniqueness, or query WHERE phone = ... cleanly" />
      )
    case '2NF':
      return fixed ? (
        <div className="grid2">
          <DataTable title="students" cols={['id', 'name']} rows={[{ id: 1, cells: [1, 'Asha'], tone: 'good' }, { id: 2, cells: [2, 'Ravi'], tone: 'good' }]} note="name stored once" />
          <DataTable title="enrollments" cols={['student_id', 'course_id', 'grade']} rows={[{ id: 1, cells: [1, 'DB101', 'A'] }, { id: 2, cells: [1, 'OS201', 'B'] }, { id: 3, cells: [2, 'DB101', 'A'] }]} note="key is (student_id, course_id); grade depends on both" />
        </div>
      ) : (
        <DataTable title="enrollments (key = student_id + course_id)" cols={['student_id', 'course_id', 'student_name', 'grade']} rows={[{ id: 1, cells: [1, 'DB101', 'Asha', 'A'], tone: 'bad' }, { id: 2, cells: [1, 'OS201', 'Asha', 'B'], tone: 'bad' }, { id: 3, cells: [2, 'DB101', 'Ravi', 'A'] }]} note="student_name depends on student_id alone (part of the key), so Asha's name is repeated" />
      )
    case '3NF':
      return fixed ? (
        <div className="grid2">
          <DataTable title="employees" cols={['id', 'name', 'dept_id (FK)']} rows={[{ id: 1, cells: [1, 'Asha', 10] }, { id: 2, cells: [2, 'Ravi', 10] }, { id: 3, cells: [3, 'Mei', 20] }]} />
          <DataTable title="departments" cols={['id', 'name']} rows={[{ id: 10, cells: [10, 'Engineering'], tone: 'good' }, { id: 20, cells: [20, 'Sales'], tone: 'good' }]} note="department name stored once" />
        </div>
      ) : (
        <DataTable title="employees (key = id)" cols={['id', 'name', 'dept_id', 'dept_name']} rows={[{ id: 1, cells: [1, 'Asha', 10, 'Engineering'], tone: 'bad' }, { id: 2, cells: [2, 'Ravi', 10, 'Engineering'], tone: 'bad' }, { id: 3, cells: [3, 'Mei', 20, 'Sales'] }]} note="dept_name depends on dept_id, which is not the key: a transitive dependency (id → dept_id → dept_name)" />
      )
    case 'BCNF':
      return fixed ? (
        <div className="grid2">
          <DataTable title="tutor_subject" cols={['tutor (PK)', 'subject']} rows={[{ id: 1, cells: ['Rao', 'Math'], tone: 'good' }, { id: 2, cells: ['Iyer', 'Physics'], tone: 'good' }, { id: 3, cells: ['Sen', 'Math'], tone: 'good' }]} note="tutor → subject, and tutor is the key here" />
          <DataTable title="student_tutor" cols={['student', 'tutor']} rows={[{ id: 1, cells: ['Asha', 'Rao'] }, { id: 2, cells: ['Ravi', 'Rao'] }, { id: 3, cells: ['Asha', 'Iyer'] }, { id: 4, cells: ['Mei', 'Sen'] }]} />
        </div>
      ) : (
        <DataTable title="tutoring (rule: each tutor teaches exactly one subject)" cols={['student', 'subject', 'tutor']} rows={[{ id: 1, cells: ['Asha', 'Math', 'Rao'], tone: 'bad' }, { id: 2, cells: ['Ravi', 'Math', 'Rao'], tone: 'bad' }, { id: 3, cells: ['Asha', 'Physics', 'Iyer'] }, { id: 4, cells: ['Mei', 'Math', 'Sen'] }]} note="tutor determines subject, but tutor alone is not a key, so 'Rao teaches Math' is repeated. 3NF allows this; BCNF does not." />
      )
    case '4NF': {
      const skills = extra ? ['Python', 'SQL', 'Go'] : ['Python', 'SQL']
      const langs = ['English', 'Hindi']
      const combos: DRow[] = skills.flatMap((k) => langs.map((l) => ({ id: `${k}-${l}`, cells: ['Asha', k, l], tone: (extra && k === 'Go' ? 'changed' : 'bad') as DRow['tone'] })))
      return fixed ? (
        <div className="grid2">
          <DataTable title="employee_skills" cols={['employee', 'skill']} rows={skills.map((k) => ({ id: k, cells: ['Asha', k], tone: (extra && k === 'Go' ? 'changed' : 'good') as DRow['tone'] }))} note={extra ? 'Adding Go = 1 new row' : undefined} />
          <DataTable title="employee_languages" cols={['employee', 'language']} rows={langs.map((l) => ({ id: l, cells: ['Asha', l], tone: 'good' as const }))} />
        </div>
      ) : (
        <DataTable title="employee_profile (skills and languages are independent)" cols={['employee', 'skill', 'language']} rows={combos} note={extra ? 'Adding Go forced 2 new rows, one per language. Forget one and the data lies.' : 'Skills and languages have nothing to do with each other, yet every skill is paired with every language'} />
      )
    }
    case '5NF':
      return fixed ? (
        <div className="grid3">
          <DataTable title="rep_company" cols={['rep', 'company']} rows={[{ id: 1, cells: ['Asha', 'Acme'], tone: 'good' }, { id: 2, cells: ['Asha', 'Beta'], tone: 'good' }]} />
          <DataTable title="rep_product" cols={['rep', 'product']} rows={[{ id: 1, cells: ['Asha', 'Pens'], tone: 'good' }, { id: 2, cells: ['Asha', 'Ink'], tone: 'good' }]} />
          <DataTable title="company_product" cols={['company', 'product']} rows={[{ id: 1, cells: ['Acme', 'Pens'], tone: 'good' }, { id: 2, cells: ['Acme', 'Ink'], tone: 'good' }, { id: 3, cells: ['Beta', 'Pens'], tone: 'good' }]} note="Joining all three gives back exactly the original 3 rows" />
        </div>
      ) : (
        <DataTable title="sales (a rep sells a product for a company)" cols={['rep', 'company', 'product']} rows={[{ id: 1, cells: ['Asha', 'Acme', 'Pens'], tone: 'bad' }, { id: 2, cells: ['Asha', 'Acme', 'Ink'], tone: 'bad' }, { id: 3, cells: ['Asha', 'Beta', 'Pens'], tone: 'bad' }]} note="Rule: Asha sells a product for a company only if she represents that company, sells that product, and the company makes it. Then every row is derivable from three pairs." />
      )
  }
}

/** Walk up the ladder 1NF → 5NF: each form shows a table that breaks the rule, then the fix. */
export function NormalForms() {
  const [form, setForm] = useState<FormId>('1NF')
  const [fixed, setFixed] = useState(false)
  const [extra, setExtra] = useState(false)
  const f = FORMS.find((x) => x.id === form)!
  const pick = (id: FormId) => { setForm(id); setFixed(false); setExtra(false) }
  return (
    <div>
      <div className="seg" role="group" aria-label="Normal form">
        {FORMS.map((x) => <button key={x.id} className={form === x.id ? 'on' : ''} onClick={() => pick(x.id)}>{x.id}</button>)}
      </div>
      <p><b>{f.id} rule:</b> {f.rule} <span className="muted small">Memory hook: "{f.hook}"</span></p>
      <div className="viz-row">
        <button className="primary" onClick={() => setFixed(!fixed)}>{fixed ? `Undo: show the ${f.id} violation` : `Fix it: normalize to ${f.id}`}</button>
        {form === '4NF' && <button className="ghost" onClick={() => setExtra(!extra)}>{extra ? "Remove skill 'Go'" : "Add skill 'Go'"}</button>}
      </div>
      <p className={`note ${fixed ? 'good' : 'bad'}`} role="status">{fixed ? 'Normalized.' : `Violates ${f.id}. Red rows hold the repeated or tangled facts.`}</p>
      <Tables id={form} fixed={fixed} extra={extra} />
      {fixed && <p>{AFTER_NOTE[form]}</p>}
      <p className="muted small"><b>How much it matters in practice:</b> {WHEN[form]}</p>
    </div>
  )
}
