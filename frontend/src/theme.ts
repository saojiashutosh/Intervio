import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'intervio.theme'

/** The saved choice, else light paper. (index.html applies the same rule before the first paint.) */
export function storedTheme(): Theme {
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'light' || s === 'dark') return s
  } catch { /* private window: fall through */ }
  return 'light'
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'dark' ? '#211e1a' : '#f3eadf')
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : storedTheme()))
  useEffect(() => { applyTheme(theme) }, [theme])
  const toggle = useCallback(() => {
    setTheme((t) => {
      const n: Theme = t === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(KEY, n) } catch { /* not saved */ }
      return n
    })
  }, [])
  return { theme, toggle }
}

const MOTION_KEY = 'intervio.motion'
export const osReducesMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The saved "play animations anyway" choice (only matters when the system asks for reduced motion). */
export function motionForced(): boolean {
  try { return localStorage.getItem(MOTION_KEY) === 'on' } catch { return false }
}

export function applyMotion(on: boolean) {
  if (on) document.documentElement.dataset.motion = 'on'
  else delete document.documentElement.dataset.motion
}

export function useMotion() {
  const [forced, setForced] = useState(motionForced)
  useEffect(() => { applyMotion(forced) }, [forced])
  const set = useCallback((on: boolean) => {
    try { if (on) localStorage.setItem(MOTION_KEY, 'on'); else localStorage.removeItem(MOTION_KEY) } catch { /* not saved */ }
    setForced(on)
  }, [])
  return { reduced: osReducesMotion() && !forced, systemAsks: osReducesMotion(), set }
}

if (typeof document !== 'undefined') applyMotion(motionForced())
