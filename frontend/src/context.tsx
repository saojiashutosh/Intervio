import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, store } from './api'
import type { Content, Profile, Roadmap } from './types'

/* ---------- Content ---------- */
interface ContentState { content: Content | null; error: string | null }
const ContentCtx = createContext<ContentState>({ content: null, error: null })
export const useContent = () => useContext(ContentCtx)

/* ---------- Auth ---------- */
interface AuthState {
  user: string | null
  signIn: (token: string, user: string) => void
  signOut: () => void
}
const AuthCtx = createContext<AuthState>({ user: null, signIn: () => {}, signOut: () => {} })
export const useAuth = () => useContext(AuthCtx)

/* ---------- Progress: server when signed in, localStorage otherwise ---------- */
interface ProgressState { done: Set<string>; toggle: (key: string) => void; clearPrefix: (prefix: string) => void; isDone: (key: string) => boolean }
const ProgressCtx = createContext<ProgressState>({ done: new Set(), toggle: () => {}, clearPrefix: () => {}, isDone: () => false })
export const useProgress = () => useContext(ProgressCtx)

/* ---------- Profile + generated roadmap ---------- */
interface PlanState {
  profile: Profile | null
  roadmap: Roadmap | null
  roadmapError: string | null
  saveProfile: (p: Profile) => Promise<void>
  clearProfile: () => Promise<void>
}
const PlanCtx = createContext<PlanState>({ profile: null, roadmap: null, roadmapError: null, saveProfile: async () => {}, clearProfile: async () => {} })
export const usePlan = () => useContext(PlanCtx)

const PROFILE_KEY = 'intervio.profile'
const readLocalProfile = (): Profile | null => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') } catch { return null } }
const writeLocalProfile = (p: Profile) => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)) } catch { /* private mode */ } }

const LOCAL_KEY = 'intervio.progress'
const readLocal = (): string[] => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') } catch { return [] } }
const writeLocal = (keys: string[]) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(keys)) } catch { /* private mode */ } }

export function Providers({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Content | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<string | null>(store.token ? store.user : null)
  const [done, setDone] = useState<Set<string>>(() => new Set(store.token ? [] : readLocal()))

  useEffect(() => {
    api.content().then(setContent).catch((e) => setError(e.message || 'Could not reach the API. Is the Django server running?'))
  }, [])

  useEffect(() => {
    if (!user) { setDone(new Set(readLocal())); return }
    api.progress().then((r) => setDone(new Set(r.keys))).catch(() => { setUser(null) })
  }, [user])

  const [profile, setProfile] = useState<Profile | null>(readLocalProfile)
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null)
  const [roadmapError, setRoadmapError] = useState<string | null>(null)

  // Signed in: the server copy wins; if there is none yet, upload what was entered while signed out.
  useEffect(() => {
    if (!user) return
    api.getProfile().then((r) => {
      if (r.profile) { setProfile(r.profile); writeLocalProfile(r.profile) }
      else { const local = readLocalProfile(); if (local) api.saveProfile(local).catch(() => {}) }
    }).catch(() => {})
  }, [user])

  useEffect(() => {
    if (!profile) { setRoadmap(null); return }
    // The roadmap is a pure function of the profile, so reuse it within this browser session
    // instead of asking the server on every page load.
    const cacheKey = 'intervio.roadmap.' + JSON.stringify(profile)
    try {
      const hit = sessionStorage.getItem(cacheKey)
      if (hit) { setRoadmap(JSON.parse(hit)); setRoadmapError(null); return }
    } catch { /* storage unavailable: just fetch */ }
    let cancelled = false
    api.roadmap(profile)
      .then((r) => {
        if (cancelled) return
        setRoadmap(r); setRoadmapError(null)
        try { sessionStorage.setItem(cacheKey, JSON.stringify(r)) } catch { /* quota or private mode */ }
      })
      .catch((e) => { if (!cancelled) setRoadmapError(e.message || 'Could not build your roadmap.') })
    return () => { cancelled = true }
  }, [profile])

  const saveProfile = useCallback(async (p: Profile) => {
    writeLocalProfile(p)
    setProfile(p)
    if (user) await api.saveProfile(p)
  }, [user])

  const signIn = useCallback((token: string, name: string) => { store.set(token, name); setUser(name) }, [])
  const signOut = useCallback(() => { store.clear(); setUser(null) }, [])

  const toggle = useCallback((key: string) => {
    // optimistic update, then reconcile with the server
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      if (!user) writeLocal([...next])
      return next
    })
    if (user) {
      api.toggle(key).then((r) => setDone((prev) => {
        const next = new Set(prev)
        if (r.done) next.add(key); else next.delete(key)
        return next
      })).catch(() => api.progress().then((r) => setDone(new Set(r.keys))).catch(() => {}))
    }
  }, [user])

  /** Forget every completed item whose key starts with `prefix` (local only; the server does this in DELETE /profile/). */
  const clearPrefix = useCallback((prefix: string) => {
    setDone((prev) => {
      const next = new Set([...prev].filter((k) => !k.startsWith(prefix)))
      if (!user) writeLocal([...next])
      return next
    })
  }, [user])

  /** Delete the profile and the roadmap tick-marks. Concept completion is kept. */
  const clearProfile = useCallback(async () => {
    try { localStorage.removeItem(PROFILE_KEY) } catch { /* private mode */ }
    setProfile(null)
    clearPrefix('rm:')
    if (user) await api.deleteProfile()
  }, [user, clearPrefix])

  const plan = useMemo<PlanState>(() => ({ profile, roadmap, roadmapError, saveProfile, clearProfile }), [profile, roadmap, roadmapError, saveProfile, clearProfile])
  const progress = useMemo<ProgressState>(() => ({ done, toggle, clearPrefix, isDone: (k) => done.has(k) }), [done, toggle, clearPrefix])
  const auth = useMemo<AuthState>(() => ({ user, signIn, signOut }), [user, signIn, signOut])

  return (
    <ContentCtx.Provider value={{ content, error }}>
      <AuthCtx.Provider value={auth}>
        <ProgressCtx.Provider value={progress}><PlanCtx.Provider value={plan}>{children}</PlanCtx.Provider></ProgressCtx.Provider>
      </AuthCtx.Provider>
    </ContentCtx.Provider>
  )
}
