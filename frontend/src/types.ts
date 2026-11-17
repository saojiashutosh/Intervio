export type VizId =
  | 'index' | 'isolation' | 'lock' | 'replication' | 'sharding' | 'nplus1' | 'oncommit'
  | 'er' | 'fk' | 'normalize' | 'denorm' | 'types' | 'constraints' | 'sqlnosql' | 'plan' | 'atomic' | 'cache' | 'pagination' | 'security'

export interface QA { id: number; topic: string; q: string; a: string }

export interface Concept {
  slug: string
  n: number
  level: number
  week: string
  title: string
  tagline: string
  explain: string[]
  key_points: string[]
  sql: { title: string; code: string }[]
  django: { title: string; code: string; note?: string }
  exercise: string
  pitfalls: string[]
  viz: VizId | ''
  interview: QA[]
  hours: number
  priority: number
  references: Reference[]
  basis: string
  sources: string[]
}

export interface Level {
  level: number
  title: string
  weeks: string
  blurb: string
  project: string
  project_goals: string[]
  acceptance: string[]
}

export interface WeekPlan { week: number; title: string; days: string[]; deliverable: string }
export interface SqlExercise { n: number; prompt: string; hint: string; solution: string }
export interface Drill { name: string; strong: string }

export interface Content {
  levels: Level[]
  concepts: Concept[]
  plan: WeekPlan[]
  exercises: SqlExercise[]
  drills: Drill[]
  general_questions: QA[]
  sources: Source[]
  level_bands: LevelBand[]
  domains: Domain[]
  notes: Record<string, string>
}

export interface Card {
  id: number; q: string; a: string; topic: string
  concept: string | null; box: number; is_new: boolean
}
export interface CardStats { total: number; new: number; due: number; mastered: number }

export interface Reference { title: string; url: string; kind: string }

export interface Profile {
  domain: 'django' | 'backend' | 'student'
  goal: 'interview' | 'learn'
  experience_years: number
  weeks: number
  hours_per_day: number
  days_per_week: number
  start_date: string
}

export interface Session {
  id: string
  kind: 'learn' | 'practice' | 'interview' | 'project' | 'capstone' | 'review' | 'mock'
  title: string
  minutes: number
  route: string
  detail: string
  concept: string | null
  part: [number, number]
}
export interface RoadmapDay { date: string; weekday: string; minutes: number; buffer: boolean; sessions: Session[] }
export interface Roadmap {
  profile: Profile
  summary: {
    needed_hours: number; planned_hours: number; budget_hours: number; study_days: number; days_used: number
    end_date: string | null; feasible: boolean; suggested_hours_per_day: number | null
  }
  cuts: string[]
  notes: string[]
  weeks: { week: number; days: RoadmapDay[] }[]
  reading: { slug: string; title: string; priority: number; references: Reference[] }[]
  skipped: { slug: string; title: string }[]
}

export interface Source {
  key: string; title: string; url: string; publisher: string
  kind: 'official' | 'survey' | 'book' | 'curriculum' | 'community-guide' | 'prep-guide' | 'job-post'
  checked: 'read' | 'snippet'
  used_for: string
}
export interface LevelBand { band: '0-2' | '2-5' | '5+'; label: string; title: string; focus: string; sources: string[] }
export interface DomainTopic { band: '0-2' | '2-5' | '5+'; area: string; topic: string; detail: string; app: string; sources: string[] }
export interface Domain { slug: string; title: string; blurb: string; sources: string[]; topics: DomainTopic[] }
