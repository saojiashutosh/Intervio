import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, store } from './api'
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
interface ProgressState { done: Set<string>; toggle: (key: string) => void; clearPrefix: (prefix: string) => void; isDone: (key: string) => boolean; notice: string | null; dismissNotice: () => void }
const ProgressCtx = createContext<ProgressState>({ done: new Set(), toggle: () => {}, clearPrefix: () => {}, isDone: () => false, notice: null, dismissNotice: () => {} })
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

const clearLocalProfile = () => { try { localStorage.removeItem(PROFILE_KEY) } catch { /* private mode */ } }

const LOCAL_KEY ='intervio.progress'
const readLocal = (): string[] => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') } catch { return [] } }
const writeLocal = (keys: string[]) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(keys)) } catch { /* private mode */ } }

export function Providers({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Content | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<string | null>(store.token ? store.user : null)
  const [done, setDone] = useState<Set<string>>(() => new Set(store.token ? [] : readLocal()))
  const [notice, setNotice] = useState<string | null>(null)
  const dismissNotice = useCallback(() => setNotice(null), [])

  useEffect(() => {
    api.content().then(setContent).catch((e) => { console.error('Content load failed:', e); setError('unavailable') })
  }, [])

  useEffect(() => {
    if (!user) { setDone(new Set(readLocal())); return }
    // Sign out only when the token is rejected (401). An outage must not log everyone out.
    api.progress().then((r) => setDone(new Set(r.keys))).catch((e) => { if (e instanceof ApiError && e.status === 401) setUser(null) })
  }, [user])

  // Signed in: the database is the only copy (loaded below). Signed out: kept in this browser until they sign up.
  const [profile, setProfile] = useState<Profile | null>(() => (store.token ? null : readLocalProfile()))
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null)
  const [roadmapError, setRoadmapError] = useState<string | null>(null)

  // Signed in: the server copy wins; if there is none yet, upload what was entered while signed out.
  useEffect(() => {
    if (!user) return
    api.getProfile().then((r) => {
      if (r.profile) { setProfile(r.profile); clearLocalProfile(); return }
      // None in the database yet: move the one entered while signed out into the account, then drop the browser copy.
      const local = readLocalProfile()
      if (local) api.saveProfile(local).then(() => clearLocalProfile()).catch(() => setNotice('Could not save your profile. Please try again.'))
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
    if (user) await api.saveProfile(p)   // database first: if this throws, nothing is shown as saved
    else writeLocalProfile(p)
    setProfile(p)
  }, [user])

  const signIn = useCallback((token: string, name: string) => { store.set(token, name); setUser(name) }, [])
  // The profile belongs to the account: drop it from memory and this browser so the next person never sees it.
  const signOut = useCallback(() => { store.clear(); clearLocalProfile(); setProfile(null); setUser(null) }, [])

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
      })).catch(() => {
        // Not saved: undo the optimistic change so the screen never shows progress the server does not have.
        setDone((prev) => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key); else next.add(key)
          return next
        })
        setNotice('Could not save your progress. Please check your connection and try again.')
      })
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
    if (user) await api.deleteProfile()   // database first: if this throws, the profile is still shown
    clearLocalProfile()
    setProfile(null)
    clearPrefix('rm:')
  }, [user, clearPrefix])

  const plan = useMemo<PlanState>(() => ({ profile, roadmap, roadmapError, saveProfile, clearProfile }), [profile, roadmap, roadmapError, saveProfile, clearProfile])
  const progress = useMemo<ProgressState>(() => ({ done, toggle, clearPrefix, isDone: (k) => done.has(k), notice, dismissNotice }), [done, toggle, clearPrefix, notice, dismissNotice])
  const auth = useMemo<AuthState>(() => ({ user, signIn, signOut }), [user, signIn, signOut])

  return (
    <ContentCtx.Provider value={{ content, error }}>
      <AuthCtx.Provider value={auth}>
        <ProgressCtx.Provider value={progress}><PlanCtx.Provider value={plan}>{children}</PlanCtx.Provider></ProgressCtx.Provider>
      </AuthCtx.Provider>
    </ContentCtx.Provider>
  )
}
