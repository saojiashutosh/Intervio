import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Predict } from '../components/Predict'

type Mode = 'async' | 'sync'
interface Commit { id: number; acked: boolean; replicated: boolean; fate?: 'lost' | 'rejected' }

export default function ReplicationViz() {
  const [mode, setMode] = useState<Mode>('async')
  const [lag, setLag] = useState(1500)
  const [commits, setCommits] = useState<Commit[]>([])
  const [crashed, setCrashed] = useState(false)
  const [readMsg, setReadMsg] = useState<string | null>(null)
  const timers = useRef<number[]>([])
  const nextId = useRef(1)

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => clearTimers, [])
  useEffect(() => { reset() }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  function reset() { clearTimers(); setCommits([]); setCrashed(false); setReadMsg(null); nextId.current = 1 }
  const patch = (id: number, p: Partial<Commit>) => setCommits((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)))

  function write() {
    if (crashed) return
    const id = nextId.current++
    setCommits((cs) => [...cs, { id, acked: false, replicated: false }])
    if (mode === 'async') {
      timers.current.push(window.setTimeout(() => patch(id, { acked: true }), 150))          // client told "OK" immediately
      timers.current.push(window.setTimeout(() => patch(id, { replicated: true }), lag))     // WAL arrives later
    } else {
      timers.current.push(window.setTimeout(() => patch(id, { replicated: true, acked: true }), lag + 150)) // OK only after standby confirms
    }
  }

  function crash() {
    if (crashed) return
    clearTimers() // WAL not yet shipped dies with the primary
    setCrashed(true)
    setCommits((cs) => cs.map((c) => (c.replicated ? c : { ...c, fate: c.acked ? 'lost' : 'rejected' })))
  }

  function readFromReplica() {
    const last = commits[commits.length - 1]
    if (!last) return setReadMsg('Nothing to read yet — place an order first.')
    setReadMsg(last.replicated
      ? `Replica returned order #${last.id}.`
      : `Replica says: order #${last.id} not found. Replication lag. The user just paid and sees “no such order”.`)
  }

  const lost = commits.filter((c) => c.fate === 'lost').length
  const rejected = commits.filter((c) => c.fate === 'rejected').length

  return (
    <div>
      <Predict
        question="With ASYNCHRONOUS replication, the primary crashes a moment after the client got “order confirmed”. Is that order guaranteed to exist on the promoted replica?"
        options={['Yes — it was acknowledged', 'No — it may not have been shipped yet']} answer={1}
        why="Async acknowledges before the standby has the WAL. That window is your RPO. Place orders below, then crash the primary quickly."
      />

      <div className="seg" role="group" aria-label="Replication mode">
        <button className={mode === 'async' ? 'on' : ''} onClick={() => setMode('async')}>Asynchronous</button>
        <button className={mode === 'sync' ? 'on' : ''} onClick={() => setMode('sync')}>Synchronous</button>
      </div>

      <div className="viz-row">
        <label className="field">Replication lag
          <input type="range" min={300} max={3000} step={100} value={lag} onChange={(e) => setLag(+e.target.value)} />
          <b>{lag} ms</b>
        </label>
        <button className="primary" onClick={write} disabled={crashed}>Place order (write)</button>
        <button className="ghost" onClick={readFromReplica}>Read latest from replica</button>
        <button className="danger" onClick={crash} disabled={crashed}>💥 Crash primary</button>
        <button className="ghost" onClick={reset}>Reset</button>
      </div>

      <div className="repl">
        <div className={`node-box ${crashed ? 'down' : ''}`}>
          <h4>Primary {crashed ? '(down)' : ''}</h4>
          <AnimatePresence>
            {commits.map((c) => (
              <motion.span key={c.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className={`pill ${c.acked ? 'ack' : 'pending'}`}>
                #{c.id} {c.acked ? '✓ ack' : mode === 'sync' ? 'waiting for standby…' : '…'}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        <div className="wire" aria-hidden>
          <span>WAL →</span>
        </div>
        <div className={`node-box ${crashed ? 'promoted' : ''}`}>
          <h4>Replica {crashed ? '→ promoted to primary' : ''}</h4>
          <AnimatePresence>
            {commits.filter((c) => c.replicated).map((c) => (
              <motion.span key={c.id} layout initial={{ opacity: 0, x: -30, scale: 0.8 }} animate={{ opacity: 1, x: 0, scale: 1 }} className="pill ack">#{c.id}</motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {readMsg && <p className="note" role="status">{readMsg}</p>}
      {crashed && (
        <p className={`note ${lost ? 'bad' : 'good'}`} role="status">
          {lost > 0
            ? `${lost} order(s) were confirmed to the customer but are GONE. That’s the data-loss window of async replication (RPO > 0).`
            : mode === 'sync'
              ? `Zero confirmed orders lost${rejected ? `; ${rejected} unconfirmed write(s) simply failed and the client retries` : ''}. The price: every write waited ${lag} ms for the standby, and if the standby is down, writes stall.`
              : 'Nothing lost this time — everything had already reached the replica. Raise the lag or crash sooner.'}
        </p>
      )}
    </div>
  )
}
