import type { ReactNode } from 'react'

/** Small line icons on a 24x24 grid, drawn for this project. Stroked with the current text colour. */
const PATHS: Record<string, ReactNode> = {
  server: <><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /><circle cx="8" cy="7" r=".7" fill="currentColor" /><circle cx="8" cy="17" r=".7" fill="currentColor" /></>,
  db: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c3 .2 5 2.4 5 5.3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>,
  balancer: <><circle cx="12" cy="4.5" r="2" /><path d="M12 6.5V10M12 10 5 15M12 10l7 5M12 10v5" /><circle cx="5" cy="18" r="2" /><circle cx="12" cy="18" r="2" /><circle cx="19" cy="18" r="2" /></>,
  queue: <><rect x="4" y="5" width="16" height="3" rx="1" /><rect x="4" y="10.5" width="16" height="3" rx="1" /><rect x="4" y="16" width="16" height="3" rx="1" /></>,
  bell: <><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  key: <><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M21 12v2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  cpu: <><rect x="7" y="7" width="10" height="10" /><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  laptop: <><rect x="4" y="5" width="16" height="11" rx="1" /><path d="M2 20h20" /></>,
  cloud: <path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 11a3.5 3.5 0 0 1-.5 7z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 7 9-7" /></>,
  flag: <path d="M5 21V4M5 4h12l-2 4 2 4H5" />,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M16 16l5 5" /></>,
  gauge: <><path d="M4 17a8 8 0 0 1 16 0" /><path d="M12 17l4-5" /></>,
  hash: <path d="M9 4 7 20M17 4l-2 16M4 9h17M3 15h17" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  box: <><path d="M12 3l8 4v10l-8 4-8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></>,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v5M12 17.5v.5" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  repeat: <><path d="M17 3l3 3-3 3" /><path d="M4 11V9a3 3 0 0 1 3-3h13" /><path d="M7 21l-3-3 3-3" /><path d="M20 13v2a3 3 0 0 1-3 3H4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  book: <><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h10" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></>,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M12 15h5" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  logo: <><path d="M12 3l8 4-8 4-8-4z" /><path d="M4 12l8 4 8-4M4 17l8 4 8-4" /></>,
  split: <><path d="M12 3v6" /><path d="M12 9 6 15v6M12 9l6 6v6" /></>,
}

export const ICON_NAMES = Object.keys(PATHS)

export function Icon({ name, size = 16, x = 0, y = 0 }: { name: string; size?: number; x?: number; y?: number }) {
  const p = PATHS[name]
  if (!p) return null
  const s = size / 24
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`} fill="none" stroke="currentColor" strokeWidth={1.7 / s} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p}
    </g>
  )
}

/** The same icons for ordinary HTML (callouts, buttons): wrapped in their own <svg>. */
export function IconInline({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden focusable="false">
      <Icon name={name} size={size} />
    </svg>
  )
}
