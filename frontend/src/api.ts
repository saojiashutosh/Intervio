import type { Card, CardStats, Content, ProblemFull, ProblemRow, Profile, Roadmap } from './types'

const TOKEN_KEY = 'intervio.token'
const USER_KEY = 'intervio.user'

export const store = {
  get token() { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  get user() { try { return localStorage.getItem(USER_KEY) } catch { return null } },
  set(token: string, user: string) { try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, user) } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY) } catch { /* private mode */ } },
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (store.token) headers.Authorization = `Token ${store.token}`
  const res = await fetch(`/api${path}`, { ...init, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) store.clear()
    if (res.status === 429) throw new ApiError(429, 'Too many requests in a short time. Wait a minute, then reload the page.')
    throw new ApiError(res.status, body.error || body.detail || `Request failed (${res.status})`)
  }
  return body as T
}

const post = <T,>(path: string, data: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(data) })

export const api = {
  content: () => request<Content>('/content/'),
  problems: () => request<ProblemRow[]>('/problems/'),
  problem: (slug: string) => request<ProblemFull>(`/problems/${slug}/`),
  register: (username: string, password: string) => post<{ token: string; username: string }>('/auth/register/', { username, password }),
  login: (username: string, password: string) => post<{ token: string; username: string }>('/auth/login/', { username, password }),
  roadmap: (p: Profile) => post<Roadmap>('/roadmap/', p),
  getProfile: () => request<{ profile: Profile | null }>('/profile/'),
  deleteProfile: () => request<unknown>('/profile/', { method: 'DELETE' }),
  saveProfile: (p: Profile) => request<{ profile: Profile }>('/profile/', { method: 'PUT', body: JSON.stringify(p) }),
  progress: () => request<{ keys: string[] }>('/progress/'),
  toggle: (key: string) => post<{ key: string; done: boolean }>('/progress/toggle/', { key }),
  cards: (limit = 20, topic?: string) =>
    request<{ cards: Card[]; stats: CardStats }>(`/flashcards/?limit=${limit}${topic ? `&topic=${topic}` : ''}`),
  review: (id: number, correct: boolean) => post<{ id: number; box: number }>(`/flashcards/${id}/review/`, { correct }),
}
