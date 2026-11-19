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
  syncThemeColor()
}

/** The browser's address bar takes the page background, whatever palette is chosen. */
export function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]')
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (meta && bg) meta.setAttribute('content', bg)
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

/* ---------- colour and font: each learner picks what they like to study with ---------- */
export type Palette = 'ocean' | 'sage' | 'lavender' | 'paper'
export type FontChoice = 'jakarta' | 'atkinson' | 'serif' | 'dmsans'
export interface Look { palette: Palette; font: FontChoice }

export const PALETTES: { id: Palette; label: string; swatch: string; note: string }[] = [
  { id: 'ocean', label: 'Ocean', swatch: '#3563e9', note: 'Calm blue' },
  { id: 'sage', label: 'Sage', swatch: '#2f7d57', note: 'Soft green' },
  { id: 'lavender', label: 'Lavender', swatch: '#7050e0', note: 'Gentle violet' },
  { id: 'paper', label: 'Paper', swatch: '#b4552d', note: 'Warm and easy on the eyes' },
]
export const FONTS: { id: FontChoice; label: string; family: string; note: string }[] = [
  { id: 'jakarta', label: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", system-ui, sans-serif', note: 'Clean and modern' },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', family: '"Atkinson Hyperlegible", system-ui, sans-serif', note: 'Made to be easy to read' },
  { id: 'serif', label: 'Source Serif', family: '"Source Serif 4", Georgia, serif', note: 'Book-style reading text' },
  { id: 'dmsans', label: 'DM Sans', family: '"DM Sans", system-ui, sans-serif', note: 'Soft and round' },
]
const LOOK_KEY = 'intervio.look'
const DEFAULT_LOOK: Look = { palette: 'ocean', font: 'jakarta' }

export function storedLook(): Look {
  try {
    const j = JSON.parse(localStorage.getItem(LOOK_KEY) ?? '{}')
    return {
      palette: PALETTES.some((p) => p.id === j.palette) ? j.palette : DEFAULT_LOOK.palette,
      font: FONTS.some((f) => f.id === j.font) ? j.font : DEFAULT_LOOK.font,
    }
  } catch { return DEFAULT_LOOK }
}

export function applyLook(l: Look) {
  document.documentElement.dataset.palette = l.palette
  document.documentElement.dataset.font = l.font
  syncThemeColor()
}

export function useLook() {
  const [look, setLook] = useState<Look>(storedLook)
  useEffect(() => { applyLook(look) }, [look])
  const update = useCallback((patch: Partial<Look>) => {
    setLook((prev) => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(LOOK_KEY, JSON.stringify(next)) } catch { /* not saved */ }
      return next
    })
  }, [])
  return { look, update }
}

if (typeof document !== 'undefined') applyLook(storedLook())
