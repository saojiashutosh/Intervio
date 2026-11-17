import { AnimatePresence, motion } from 'framer-motion'

export interface DRow { id: string | number; cells: (string | number | null)[]; tone?: 'good' | 'bad' | 'wait' | 'changed' }

/** A small animated table: rows slide in when inserted, out when deleted, and can be tinted. */
export function DataTable({ title, cols, rows, note }: { title: string; cols: string[]; rows: DRow[]; note?: string }) {
  return (
    <div className="dtable">
      <div className="dtable-title">{title}</div>
      <table>
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.tr
                key={r.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16, transition: { duration: 0.25 } }}
                className={r.tone ?? ''}
              >
                {r.cells.map((c, i) => <td key={i}>{c === null ? <em className="null">NULL</em> : c}</td>)}
              </motion.tr>
            ))}
          </AnimatePresence>
          {rows.length === 0 && <tr><td colSpan={cols.length} className="muted small">(no rows)</td></tr>}
        </tbody>
      </table>
      {note && <div className="dtable-note muted small">{note}</div>}
    </div>
  )
}

/** A result banner used by many animations: success / error / waiting. */
export function Result({ tone, children }: { tone: 'good' | 'bad' | 'wait'; children: React.ReactNode }) {
  return <motion.pre key={String(children)} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`result ${tone}`} role="status">{children}</motion.pre>
}
