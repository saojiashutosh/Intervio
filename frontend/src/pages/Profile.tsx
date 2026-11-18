import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { usePlan } from '../context'
import type { Profile, Roadmap } from '../types'

const today = () => new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD

const DEFAULTS: Profile = { domain: 'django', goal: 'interview', experience_years: 1.5, weeks: 0, hours_per_day: 2, days_per_week: 6, start_date: today() }

export default function ProfilePage() {
  const { profile, saveProfile } = usePlan()
  const [p, setP] = useState<Profile>(profile ?? DEFAULTS)
  const [preview, setPreview] = useState<Roadmap['summary'] & { cuts: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nav = useNavigate()

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }))

  // Live "will this fit?" feedback, debounced.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      api.roadmap(p)
        .then((r) => { if (!cancelled) { setPreview({ ...r.summary, cuts: r.cuts.length }); setError(null) } })
        .catch((e) => { if (!cancelled) { setPreview(null); setError(e.message) } })
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [p])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try { await saveProfile(p); nav('/my-plan') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save your profile.') }
    finally { setSaving(false) }
  }

  const num = (v: string) => (v === '' ? NaN : Number(v))

  return (
    <form className="card profile" onSubmit={submit}>
      <h1>Build my roadmap</h1>
      <p className="muted">Tell me where you are and how much time you have, or choose no deadline and I’ll keep every lesson and tell you how long it takes. I’ll schedule every study session on a real calendar, and if you set a deadline I’ll tell you exactly what had to be cut.</p>

      <div className="form-grid">
        <label>Your background
          <select value={p.domain} onChange={(e) => set('domain', e.target.value as Profile['domain'])}>
            <option value="django">Django / Python backend developer</option>
            <option value="backend">Backend developer (another stack)</option>
            <option value="student">Student / new to backend</option>
            <option value="sde">Software engineer (generalist)</option>
            <option value="fullstack">Full-stack developer</option>
            <option value="frontend">Frontend developer</option>
            <option value="data">Data engineer</option>
            <option value="devops">DevOps / SRE</option>
            <option value="ml">Machine learning engineer</option>
          </select>
        </label>
        <label>Goal
          <select value={p.goal} onChange={(e) => set('goal', e.target.value as Profile['goal'])}>
            <option value="interview">Prepare for interviews</option>
            <option value="learn">Learn in depth (no mock interviews)</option>
          </select>
        </label>
        <label>Years of experience
          <input type="number" min={0} max={30} step={0.5} value={Number.isNaN(p.experience_years) ? '' : p.experience_years} onChange={(e) => set('experience_years', num(e.target.value))} required />
        </label>
        <label>Time you have (weeks)
          <input type="number" min={1} max={52} step={1} disabled={p.weeks === 0} placeholder="no deadline" value={p.weeks === 0 || Number.isNaN(p.weeks) ? '' : p.weeks} onChange={(e) => set('weeks', num(e.target.value))} required={p.weeks !== 0} />
        </label>
        <label className="check">
          <input type="checkbox" checked={p.weeks === 0} onChange={(e) => set('weeks', e.target.checked ? 0 : 12)} /> No deadline: take as long as it needs. Nothing is cut.
        </label>
        <label>Hours per study day
          <input type="number" min={0.5} max={12} step={0.5} value={Number.isNaN(p.hours_per_day) ? '' : p.hours_per_day} onChange={(e) => set('hours_per_day', num(e.target.value))} required />
        </label>
        <label>Study days per week
          <select value={p.days_per_week} onChange={(e) => set('days_per_week', Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>Start date
          <input type="date" value={p.start_date} onChange={(e) => set('start_date', e.target.value)} required />
        </label>
      </div>

      {error && <p className="note bad" role="alert">{error}</p>}
      {preview && !error && (
        <div className={`note ${preview.feasible && preview.cuts === 0 ? 'good' : preview.feasible ? 'wait' : 'bad'}`} role="status">
          {p.weeks === 0
            ? <><b>Everything needs about {preview.needed_hours} h.</b> At {p.hours_per_day} h × {p.days_per_week} days a week that is about {Math.ceil(preview.study_days / p.days_per_week)} weeks, finishing around {preview.end_date}. Nothing is cut.</>
            : <b>Everything needs about {preview.needed_hours} h; you have {preview.budget_hours} h.</b>}{' '}
          {p.weeks === 0 ? null : preview.cuts === 0
            ? `It all fits and you’d finish around ${preview.end_date}.`
            : preview.feasible
              ? `It doesn’t all fit, so ${preview.cuts} kind(s) of cut will be made (you’ll see exactly which). Studying ${preview.suggested_hours_per_day} h/day would fit everything.`
              : `Even the essentials won’t fit. Try about ${preview.suggested_hours_per_day} h/day, more weeks, or more days per week.`}
        </div>
      )}

      <button className="btn primary" disabled={saving || !!error}>{saving ? 'Saving…' : profile ? 'Update my roadmap' : 'Generate my roadmap'}</button>
    </form>
  )
}
