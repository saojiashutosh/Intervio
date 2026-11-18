import type { NodeKind, StageNode, NodePatch, StageScene } from '../../types'

/** Isometric projection: one world cell is 56 px across and 32 px deep on screen. */
export const UX = 56
export const UY = 32
export const iso = (x: number, y: number, z = 0) => ({ x: (x - y) * UX, y: (x + y) * UY - z })

/** Height (px) of each node shape above the floor. */
export const HEIGHT: Record<NodeKind, number> = { cube: 52, db: 46, crowd: 12, device: 30, dot: 12, zone: 0, ring: 0 }
/** How far a link stops short of the node centre so arrowheads stay visible. */
export const RADIUS: Record<NodeKind, number> = { cube: 60, db: 50, crowd: 58, device: 48, dot: 13, zone: 0, ring: 0 }
/** Cube nodes can take another shape through their icon: a flat array cell, a stack plate or a round tree/graph node. */
export const SHAPES: Record<string, { h: number; radius: number; ext: { l: number; r: number; t: number; b: number } }> = {
  cell: { h: 18, radius: 46, ext: { l: 50, r: 50, t: 18 + 24 + 16, b: 30 } },
  plate: { h: 14, radius: 52, ext: { l: 56, r: 56, t: 14 + 24 + 16, b: 30 } },
  ball: { h: 52, radius: 32, ext: { l: 36, r: 36, t: 52 + 24 + 16, b: 22 } },
}
export const shapeOf = (n: StageNode) => (n.kind === 'cube' && n.icon ? SHAPES[n.icon] : undefined)
export const heightOf = (n: StageNode) => shapeOf(n)?.h ?? HEIGHT[n.kind]
export const radiusOf = (n: StageNode) => shapeOf(n)?.radius ?? RADIUS[n.kind]
export const CROWD_W = 1.8
export const CROWD_D = 1.3

export const anchor = (n: StageNode, x: number, y: number) => iso(x, y, heightOf(n) / 2)

export function pillWidth(text: string, icon?: string, bar = false) {
  return Math.max(30, text.length * 6.9 + 18 + (icon ? 17 : 0) + (bar ? 50 : 0))
}

/** The position and visibility of every node at a given step, after applying each step's patches in order. */
export function foldState(scene: StageScene, upTo: number) {
  const patch: Record<string, NodePatch> = {}
  let hud = scene.steps[0]?.hud ?? []
  for (let k = 0; k <= upTo && k < scene.steps.length; k++) {
    const s = scene.steps[k]
    if (s.set) for (const [id, p] of Object.entries(s.set)) patch[id] = { ...patch[id], ...p }
    if (s.hud) hud = s.hud
  }
  return { patch, hud }
}

export function visibleAt(n: StageNode, p: NodePatch | undefined, step: number) {
  if (p?.hidden) return false
  if (n.from !== undefined && step < n.from) return false
  if (n.until !== undefined && step > n.until) return false
  return true
}

/** How far a node reaches from its floor centre, in screen px, counting its widest pill. */
function reach(n: StageNode, pillTexts: { text: string; icon?: string }[], hasLoad: boolean) {
  const w = n.w ?? CROWD_W, d = n.h ?? CROWD_D
  const ext =
    shapeOf(n) ? shapeOf(n)!.ext
    : n.kind === 'cube' ? { l: 58, r: 58, t: HEIGHT.cube + UY + 16, b: 38 }
    : n.kind === 'db' ? { l: 46, r: 46, t: HEIGHT.db + 21 + 16, b: 21 + 34 }
    : n.kind === 'crowd' ? { l: (w + d) * UX / 2 + 8, r: (w + d) * UX / 2 + 8, t: (w + d) * UY / 2 + 44, b: (w + d) * UY / 2 + 40 }
    : n.kind === 'device' ? { l: 62, r: 62, t: 66, b: 60 }
    : n.kind === 'dot' ? { l: 22, r: 22, t: 40, b: 16 }
    : n.kind === 'zone' ? { l: ((n.w ?? 3) + (n.h ?? 3)) * UX / 2 + 10, r: ((n.w ?? 3) + (n.h ?? 3)) * UX / 2 + 10, t: ((n.w ?? 3) + (n.h ?? 3)) * UY / 2 + 8, b: ((n.w ?? 3) + (n.h ?? 3)) * UY / 2 + 28 }
    : { l: (n.r ?? 2) * UX * Math.SQRT2 + 18, r: (n.r ?? 2) * UX * Math.SQRT2 + 18, t: (n.r ?? 2) * UY * Math.SQRT2 + 18, b: (n.r ?? 2) * UY * Math.SQRT2 + 18 }
  const widest = Math.max(0, ...pillTexts.map((p) => pillWidth(p.text, p.icon))) / 2 + 6
  const stack = pillTexts.length ? 28 : 0
  return { l: Math.max(ext.l, widest), r: Math.max(ext.r, widest), t: ext.t + stack + (hasLoad ? 28 : 0), b: ext.b }
}

/** Smallest box (in screen px) that holds every node at every step, so the picture never jumps between steps. */
export function sceneBounds(scene: StageScene) {
  if (!scene.nodes.length) return { x: 0, y: 0, w: 1, h: 1 }
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity
  for (const n of scene.nodes) {
    const pills: { text: string; icon?: string }[] = []
    let load = false
    const spots = [{ x: n.x, y: n.y }]
    for (const s of scene.steps) {
      const p = s.set?.[n.id]
      if (!p) continue
      if (p.pill) pills.push(p.pill)
      if (p.load != null) load = true
      if (p.x !== undefined || p.y !== undefined) spots.push({ x: p.x ?? n.x, y: p.y ?? n.y })
    }
    if (n.label && (n.kind === 'db' || n.kind === 'crowd' || n.kind === 'device')) pills.push({ text: n.label, icon: 'users' })
    const e = reach(n, pills, load)
    for (const sp of spots) {
      const o = iso(sp.x, sp.y)
      l = Math.min(l, o.x - e.l); r = Math.max(r, o.x + e.r); t = Math.min(t, o.y - e.t); b = Math.max(b, o.y + e.b)
    }
  }
  const pad = 10
  return { x: l - pad, y: t - pad, w: r - l + pad * 2, h: b - t + pad * 2 }
}
