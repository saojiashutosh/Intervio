export type VizId =
  | 'index' | 'isolation' | 'lock' | 'replication' | 'sharding' | 'nplus1' | 'oncommit'
  | 'er' | 'fk' | 'normalize' | 'denorm' | 'types' | 'constraints' | 'sqlnosql' | 'plan' | 'atomic' | 'cache' | 'pagination' | 'security' | 'sysdesign' | 'migrate' | 'bigo' | 'algo' | 'scenes' | 'stage'

export interface QA { id: number; topic: string; q: string; a: string }

export interface Concept {
  slug: string
  n: number
  level: number
  week: string
  title: string
  tagline: string
  explain: string[]
  /** A plain-words opener: one sentence, an everyday story, and what each part of the story stands for. */
  everyday?: { plain: string; story: string; maps: [string, string][]; words?: [string, string][] }
  key_points: string[]
  sql: { title: string; code: string; lang?: string }[]
  django: { title: string; code: string; note?: string }
  exercise: string
  pitfalls: string[]
  viz: VizId | ''
  lab?: VizId | ''
  scenes: Scene[] | StageScene[]
  interview: QA[]
  hours: number
  priority: number
  references: Reference[]
  basis: string
  sources: string[]
}

export interface Track { slug: string; title: string; blurb: string }

/** Data-driven animation: a scene is a predict question plus steps made of simple blocks. */
export type Block =
  | { t: 'text'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'code'; lang?: string; code: string; title?: string }
  | { t: 'table'; title: string; cols: string[]; rows: (string | number | null)[][]; tones?: (string | null)[]; note?: string }
  | { t: 'flow'; nodes: { label: string; state?: 'on' | 'done' | 'idle' | 'bad' }[] }
  | { t: 'chips'; items: { k: string; v: string; tone?: string }[] }
export interface SceneStep { title: string; note: string; blocks: Block[] }
export interface Scene {
  id: string
  title: string
  predict?: { question: string; options: string[]; answer: number; why: string }
  steps: SceneStep[]
}

export interface Level {
  track: string
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
  tracks: Track[]
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
  domain: 'django' | 'backend' | 'student' | 'sde' | 'fullstack' | 'frontend' | 'data' | 'devops' | 'ml'
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

/* ---- Stage: a data-driven isometric diagram you step through (viz: "stage") ---- */
export type Tone = 'blue' | 'orange' | 'purple' | 'green' | 'yellow' | 'grey' | 'red' | 'teal'
export type NodeKind = 'cube' | 'db' | 'crowd' | 'device' | 'dot' | 'zone' | 'ring'
export interface StageNode {
  id: string; kind: NodeKind; x: number; y: number
  label?: string; icon?: string; tone?: Tone
  /** First step (0-based) on which the node is visible, and the last. */
  from?: number; until?: number
  /** zone: width and depth in cells. ring: radius in cells. crowd: number of people drawn. */
  w?: number; h?: number; r?: number; n?: number
}
export interface Pill { text: string; tone?: Tone; icon?: string }
export interface NodePatch {
  x?: number; y?: number; label?: string; tone?: Tone
  pill?: Pill | null
  /** 0-100 load meter shown above the node. */
  load?: number | null
  status?: 'ok' | 'down' | 'hot' | 'dim' | 'live'
  hidden?: boolean
}
export interface StageLink { a: string; b: string; dir?: 'to' | 'both' | 'none'; dash?: boolean; label?: string; from?: number; until?: number }
/** One kind of packet travelling along a path of node ids, repeating while the step is on screen. */
export interface Flow { path: string[]; kind: string; n?: number; delay?: number }
export interface Hud { k: string; v: string; tone?: 'good' | 'warn' | 'bad' }
export interface StageStep {
  title: string
  short?: string
  tag: 'problem' | 'technique' | 'solution' | 'insight' | 'case'
  body: string[]
  callout?: { kind: 'tip' | 'warn' | 'insight'; text: string }
  hud?: Hud[]
  set?: Record<string, NodePatch>
  flows?: Flow[]
  card?: { title: string; lines: string[]; hl?: number[] }
  /** Further cards for a step that needs more than one (for example a table and a snippet). */
  cards?: { title: string; lines: string[]; hl?: number[] }[]
  changes?: string[]
  predict?: { question: string; options: string[]; answer: number; why: string }
}
export interface StageScene {
  kind: 'stage'
  id: string
  title: string
  legend: { kind: string; label: string }[]
  learn: { text: string; at: number }[]
  nodes: StageNode[]
  links: StageLink[]
  steps: StageStep[]
}


export interface ProblemRow { slug: string; title: string; difficulty: 'easy' | 'medium' | 'hard'; concept: string | null; concept_title: string | null; cases: number }
export interface ProblemFull extends Omit<ProblemRow, 'cases'> {
  statement: string
  examples: { input: string; output: string; note?: string }[]
  starter: string
  prelude: string
  cases: { name: string; code: string }[]
  hints: string[]
  solution: string
  notes: string
}
