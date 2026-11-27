// Render smoke test: mounts the real <App/> against the live Django API (http://127.0.0.1:8000)
// and visits every page and every animation. Fails on any crash or error-boundary screen.
// Run:  npm test   (Django must be running)
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'

// The real runner needs a Web Worker and downloads Python (checked in a real browser). Here it is replaced by a controllable fake.
const runMock = vi.hoisted(() => ({ next: { results: [] as { name: string; ok: boolean; error?: string }[] } as { results: { name: string; ok: boolean; error?: string }[]; stopped?: boolean; error?: string } }))
vi.mock('./lib/pyrunner', () => ({ stopRun: () => {}, runCases: async (_p: string, _c: string, cases: { name: string }[], onStatus?: (s: string) => void) => { onStatus?.('running'); return runMock.next.results.length || runMock.next.stopped || runMock.next.error ? runMock.next : { results: cases.map((c) => ({ name: c.name, ok: true })) } } }))

const API = 'http://127.0.0.1:8000'

beforeAll(() => {
  const real = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    real(typeof input === 'string' && input.startsWith('/') ? API + input : input, init))
  window.scrollTo = () => {}
})
afterEach(() => { cleanup(); localStorage.clear() })

const IGNORED = /not wrapped in act|ReactDOMTestUtils/

/** Click the stage's own Next button n times. */
/** The first button with this name that is not part of the lesson's own step bar or Back/Continue bar. */
const pick = (name: RegExp | string) => screen.getAllByRole('button', { name }).filter((b) => !b.closest('nav.lesson-steps, .lesson-nav'))[0]
const stageNext = (c: HTMLElement, n: number) => {
  for (let i = 0; i < n; i++) {
    const b = c.querySelector<HTMLButtonElement>('.stage-nav .primary')
    if (b && !b.disabled) fireEvent.click(b)
  }
}
/** Queries scoped to the old interactive widget, which now sits in a collapsible lab under the stage. */
const inLab = (c: HTMLElement) => { const d = c.querySelector('details.lab') as HTMLDetailsElement; d.open = true; return within(d) }

async function visit(path: string, expectText: RegExp) {
  // A lesson opens on its first step (the story). Tests that look at the animation open the Watch step directly.
  if (/^\/concept\/[^?#]+(#.*)?$/.test(path) && /Interactive/.test(String(expectText))) path = path.replace(/^([^#]+)/, '$1?s=watch')
  window.history.pushState({}, '', path)
  const errors: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    const msg = a.map(String).join(' ')
    if (!IGNORED.test(msg)) errors.push(msg)
  })
  try {
    const { container } = render(<App />)
    await waitFor(() => expect(container.textContent).toMatch(expectText), { timeout: 15000 })
    // Lazy chunks load in any order. Wait for the main animation so "first Next-step button" means that one.
    if (/Interactive/.test(String(expectText))) await waitFor(() => expect(container.querySelector('section.viz')?.textContent).not.toMatch(/Loading animation/), { timeout: 15000 })
    // The old widget in the lab loads in its own chunk: wait for it too, or a quick test clicks before it exists.
    if (/Interactive/.test(String(expectText))) await waitFor(() => { const lab = container.querySelector('details.lab'); if (lab) expect(lab.textContent).not.toMatch(/Loading/) }, { timeout: 15000 })
    // Visuals inside the text load in their own chunks: wait until no "Loading" placeholder is left.
    await waitFor(() => expect(container.textContent).not.toMatch(/Loading visual…|Loading animation…/), { timeout: 15000 })
    expect(container.querySelector('[role=alert]'), 'error boundary is showing').toBeNull()
    expect(errors, 'console errors').toEqual([])
    return container
  } finally { spy.mockRestore() }
}

describe('pages render', () => {
  const pages: [string, RegExp][] = [
    ['/', /Learn how it really works/],
    ['/plan', /12-week study plan/],
    ['/my-plan', /Your personal roadmap/],
    ['/profile', /Build my roadmap/],
    ['/domains', /What to know, by domain/],
    ['/sources', /Sources & how much to trust/],
    ['/practice', /SQL practice/],
    ['/projects', /Capstone: production-style Django API/],
    ['/interview', /Interview drill/],
    ['/login', /Sign in/],
    ['/no-such-page', /Page not found/],
  ]
  it.each(pages)('%s', async (path, text) => { await visit(path, text) })
})

describe('every concept page renders', () => {
  const slugs = ['er-modelling', 'keys', 'normalization', 'denormalization', 'data-types', 'constraints', 'sql-vs-nosql', 'explain', 'indexing',
    'acid', 'isolation', 'locks-mvcc', 'replication', 'sharding', 'consistency', 'django-orm', 'drf-api', 'celery-async', 'web-security']
  it.each(slugs)('/concept/%s', async (slug) => {
    const c = await visit(`/concept/${slug}?s=finish`, /Why this priority\?/)
    expect(c.textContent).toMatch(/Read & refer/)
    cleanup()
    const q = await visit(`/concept/${slug}?s=check`, /interview questions/i)
    expect(q.textContent).toMatch(/interview questions/i)
  })
})

describe('personal roadmap with a saved profile', () => {
  it('shows today/next, schedule, cuts and reading list', async () => {
    const start = new Date().toLocaleDateString('en-CA')
    localStorage.setItem('intervio.profile', JSON.stringify({ domain: 'django', goal: 'interview', experience_years: 1.5, weeks: 8, hours_per_day: 2, days_per_week: 6, start_date: start }))
    const c = await visit('/my-plan', /Full schedule/)
    expect(c.textContent).toMatch(/What I had to cut/)
    expect(c.textContent).toMatch(/Read & refer/)
    expect(c.textContent).toMatch(/Django ORM in Depth/)
  })
  it('domains page pre-selects the band from the profile and cites sources', async () => {
    localStorage.setItem('intervio.profile', JSON.stringify({ domain: 'django', goal: 'interview', experience_years: 1.5, weeks: 8, hours_per_day: 2, days_per_week: 6, start_date: new Date().toLocaleDateString('en-CA') }))
    const c = await visit('/domains', /Pre-selected from your profile/)
    expect(c.querySelectorAll('.cite').length).toBeGreaterThan(5)
    expect(c.textContent).toMatch(/Learn in Intervio/)
  })
})

describe('animations respond to interaction', () => {
  const click = (name: RegExp) => fireEvent.click(pick(name))

  it('N+1: switching strategy changes the query count', async () => {
    const c = await visit('/concept/django-orm', /Interactive/)
    const lab = inLab(c)
    await lab.findAllByText(/queries:/)
    fireEvent.click(lab.getAllByRole('button', { name: /Run the page/ })[0])
    await waitFor(() => expect(c.querySelector('.querylog code')).not.toBeNull())
    fireEvent.click(lab.getAllByRole('button', { name: /select_related/ })[0])
    await waitFor(() => expect(c.textContent).toMatch(/1 query no matter how many orders/))
  })
  it('on_commit race: steps through both versions', async () => {
    const c = await visit('/concept/celery-async', /Interactive/)
    const lab = inLab(c)
    await lab.findAllByText(/Web request/)
    for (let i = 0; i < 3; i++) fireEvent.click(lab.getAllByRole('button', { name: /next step/i })[0])
    await waitFor(() => expect(c.textContent).toMatch(/DoesNotExist/))
    fireEvent.click(lab.getAllByRole('button', { name: /transaction\.on_commit/ })[0])
    await waitFor(() => expect(c.textContent).not.toMatch(/FAILED/))
  })
  it('lock race: naive then atomic', async () => {
    const c = await visit('/concept/locks-mvcc', /Interactive/)
    const lab = inLab(c)
    await lab.findAllByText(/Buyer|Predict/)
    for (let i = 0; i < 4; i++) fireEvent.click(lab.getAllByRole('button', { name: /next step/i })[0])
    await waitFor(() => expect(c.textContent).toMatch(/Oversold/))
    fireEvent.click(lab.getAllByRole('button', { name: /Atomic conditional UPDATE/ })[0])
    await waitFor(() => expect(c.querySelector('.bubble')).toBeNull())
  })
  it('isolation: both levels', async () => {
    const c = await visit('/concept/isolation', /Interactive/)
    for (let i = 0; i < 4; i++) click(/next step/i)
    await waitFor(() => expect(c.textContent).toMatch(/Non-repeatable read/))
    click(/REPEATABLE READ/)
    for (let i = 0; i < 4; i++) click(/next step/i)
    await waitFor(() => expect(c.textContent).toMatch(/Stable snapshot/))
  })
  it('index: seq scan, btree, low selectivity', async () => {
    const c = await visit('/concept/indexing', /Interactive/)
    click(/B-tree Index Scan/)
    expect(c.textContent).toMatch(/root → internal → leaf/)
    const sliders = c.querySelectorAll('input[type=range]')
    fireEvent.change(sliders[sliders.length - 1], { target: { value: '60' } })
    await waitFor(() => expect(c.textContent).toMatch(/Sequential scan/))
  })
  it('replication: write then crash the primary', async () => {
    const c = await visit('/concept/replication', /Interactive/)
    click(/Place order/)
    click(/Crash primary/)
    await waitFor(() => expect(c.textContent).toMatch(/GONE|Nothing lost|rejected|failed and the client retries|Zero confirmed/))
  })
  it('sharding: every strategy renders bars', async () => {
    const c = await visit('/concept/sharding', /Interactive/)
    click(/created_at range/)
    await waitFor(() => expect(c.textContent).toMatch(/hotspot/))
    click(/tenant_id/)
    expect(c.querySelectorAll('.bar').length).toBeGreaterThan(1)
  })
})

describe('error boundary', () => {
  it('shows a recoverable message instead of a blank page when a page throws', async () => {
    const { ErrorBoundary } = await import('./components/ErrorBoundary')
    const Bomb = () => { throw new Error('boom') }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    spy.mockRestore()
    expect(container.querySelector('[role=alert]')?.textContent).toMatch(/Something went wrong/)
    expect(container.textContent).toMatch(/boom/)
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy()
  })
})

describe('delete my roadmap', () => {
  const profile = () => JSON.stringify({ domain: 'django', goal: 'interview', experience_years: 1.5, weeks: 8, hours_per_day: 2, days_per_week: 6, start_date: new Date().toLocaleDateString('en-CA') })

  it('removes the profile and roadmap ticks but keeps concept progress', async () => {
    localStorage.setItem('intervio.profile', profile())
    localStorage.setItem('intervio.progress', JSON.stringify(['rm:django-orm:learn.1', 'concept:acid']))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const c = await visit('/my-plan', /Full schedule/)
    fireEvent.click(screen.getByRole('button', { name: /delete my roadmap/i }))
    await waitFor(() => expect(c.textContent).toMatch(/Your personal roadmap/))
    expect(localStorage.getItem('intervio.profile')).toBeNull()
    expect(JSON.parse(localStorage.getItem('intervio.progress') || '[]')).toEqual(['concept:acid'])
    confirm.mockRestore()
  })

  it('does nothing when the user cancels the confirmation', async () => {
    localStorage.setItem('intervio.profile', profile())
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const c = await visit('/my-plan', /Full schedule/)
    fireEvent.click(screen.getByRole('button', { name: /delete my roadmap/i }))
    expect(c.textContent).toMatch(/Full schedule/)
    expect(localStorage.getItem('intervio.profile')).not.toBeNull()
    confirm.mockRestore()
  })
})

describe('every concept has an animation', () => {
  it('shows the Interactive panel on every concept page', async () => {
    const res = await fetch('/api/content/')
    const content = await res.json() as { concepts: { slug: string; viz: string }[] }
    expect(content.concepts.length).toBeGreaterThanOrEqual(21)
    expect(content.concepts.filter((c) => !c.viz)).toEqual([])
  })
})

describe('new animations respond to interaction', () => {
  const click = (name: RegExp | string) => fireEvent.click(pick(name))
  const steps = (n: number) => { for (let i = 0; i < n; i++) click(/next step/i) }

  it('er: junction table rejects a duplicate pairing', async () => {
    const c = await visit('/concept/er-modelling', /Interactive/)
    click('Add another order for Asha')
    await waitFor(() => expect(c.textContent).toMatch(/Many orders may point at the same customer/))
    click('Many-to-many'); click('Tag Mouse as Gaming'); click('Tag Mouse as Gaming')
    await waitFor(() => expect(c.textContent).toMatch(/duplicate key value/))
  })
  it('fk: invalid reference is rejected and CASCADE deletes children', async () => {
    const c = await visit('/concept/keys', /Interactive/)
    click(/^INSERT$/)
    await waitFor(() => expect(c.textContent).toMatch(/violates foreign key constraint "orders_customer_id_fkey"/))
    fireEvent.change(c.querySelectorAll('select')[1], { target: { value: 'CASCADE' } })  // [new customer, ON DELETE mode, customer to delete]
    click(/^DELETE$/)
    await waitFor(() => expect(c.textContent).toMatch(/2 order\(s\) were deleted/))
  })
  it('fk: RESTRICT blocks deleting a referenced customer', async () => {
    const c = await visit('/concept/keys', /Interactive/)
    click(/^DELETE$/)
    await waitFor(() => expect(c.textContent).toMatch(/is still referenced from table "orders"/))
  })
  it('normalize: flat table drifts, normalized table does not', async () => {
    const c = await visit('/concept/normalization', /Interactive/)
    click('Asha moves to Pune')
    await waitFor(() => expect(c.textContent).toMatch(/update anomaly/), { timeout: 15000 })
    click('Normalized (3NF)'); click('Asha moves to Pune')
    await waitFor(() => expect(c.textContent).toMatch(/1 row changed/))
  })
  it('normalize: every normal form 1NF to 5NF can be broken and fixed', async () => {
    const c = await visit('/concept/normalization', /Interactive/)
    click(/Climb the normal forms/)
    const cases: [string, RegExp, RegExp][] = [
      ['1NF', /555-0101, 555-0102/, /student_phones/],
      ['2NF', /student_name/, /enrollments/],
      ['3NF', /dept_name/, /departments/],
      ['BCNF', /tutoring/, /tutor_subject/],
      ['4NF', /employee_profile/, /employee_languages/],
      ['5NF', /sales \(a rep sells/, /company_product/],
    ]
    for (const [id, broken, fixed] of cases) {
      click(id)
      await waitFor(() => expect(c.textContent).toMatch(broken))
      click(new RegExp(`Fix it: normalize to ${id}`))
      await waitFor(() => expect(c.textContent).toMatch(fixed))
      expect(c.textContent).toMatch(/Normalized\./)
    }
    click('4NF'); click("Add skill 'Go'")
    await waitFor(() => expect(c.textContent).toMatch(/Adding Go forced 2 new rows/))
    click(/Fix it: normalize to 4NF/)
    await waitFor(() => expect(c.textContent).toMatch(/Adding Go = 1 new row/))
  })
  it('constraints: ON rejects bad rows, OFF stores them', async () => {
    const c = await visit('/concept/constraints', /Interactive/)
    click('Negative price')
    await waitFor(() => expect(c.textContent).toMatch(/products_price_check/))
    click(/Constraints OFF/); click('Negative price')
    await waitFor(() => expect(c.textContent).toMatch(/invalid rows stored:\s*1/))
  })
  it('denorm: price change rewrites the invoice unless snapshotted', async () => {
    const c = await visit('/concept/denormalization', /Interactive/)
    click(/Catalogue price rises/)
    await waitFor(() => expect(c.textContent).toMatch(/Total ₹1,300/))
    click(/Snapshot unit_price/)
    await waitFor(() => expect(c.textContent).toMatch(/Total ₹1,000/))
  })
  it('types: floats drift; NULL logic table renders', async () => {
    const c = await visit('/concept/data-types', /Interactive/)
    click(/Add ₹0\.10/); click(/Add ₹0\.10/); click(/Add ₹0\.10/)
    await waitFor(() => expect(c.textContent).toMatch(/0\.30000000000000004/))
    click(/NULL logic/)
    await waitFor(() => expect(c.querySelectorAll('.nulltable tbody tr').length).toBe(3))
  })
  it('sqlnosql: picking the right store is scored', async () => {
    const c = await visit('/concept/sql-vs-nosql', /Interactive/)
    click('PostgreSQL')
    await waitFor(() => expect(c.textContent).toMatch(/Correct\./))
    expect(c.textContent).toMatch(/score:\s*1/)
  })
  it('plan: steps leaf-first and shows the stale statistics tell', async () => {
    const c = await visit('/concept/explain', /Interactive/)
    steps(1)
    await waitFor(() => expect(c.textContent).toMatch(/Step 1: Seq Scan on products/))
    click('Stale statistics'); steps(1)
    await waitFor(() => expect(c.textContent).toMatch(/stale statistics/i))
  })
  it('atomic: rollback restores the state only inside a transaction', async () => {
    const c = await visit('/concept/acid', /Interactive/)
    steps(4)
    await waitFor(() => expect(c.textContent).toMatch(/Inconsistent state/))
    click(/transaction\.atomic\(\)/); steps(6)
    await waitFor(() => expect(c.textContent).toMatch(/Atomicity: all steps happen or none do/))
  })
  it('cache: invalidating before commit leaves a stale value', async () => {
    const c = await visit('/concept/consistency', /Interactive/)
    steps(4)
    await waitFor(() => expect(c.textContent).toMatch(/STALE/))
  })
  it('pagination: offset repeats rows after inserts, cursor does not', async () => {
    const c = await visit('/concept/drf-api', /Interactive/)
    click('A new order arrives'); click('A new order arrives'); click('Load next page')
    await waitFor(() => expect(c.textContent).toMatch(/shown more than once/))
    expect(c.textContent).toMatch(/no duplicates or gaps so far/)
  })
  it('security: injection leaks all rows, IDOR leaks another order', async () => {
    const c = await visit('/concept/web-security', /Interactive/)
    const lab = inLab(c)
    await waitFor(() => expect(c.textContent).toMatch(/Every customer leaked/))
    fireEvent.click(lab.getAllByRole('button', { name: /IDOR/ })[0])
    await waitFor(() => expect(c.textContent).toMatch(/Asha just read Ravi's order/))
    fireEvent.click(lab.getAllByRole('button', { name: /Authorizes the object/ })[0])
    await waitFor(() => expect(c.textContent).toMatch(/404/))
  })
})

describe('visuals embedded in lessons', () => {
  const click = (name: RegExp | string) => fireEvent.click(pick(name))
  /** Work inside one embedded visual (pages also contain older animations with their own buttons). */
  const fig = async (label: string) => within(await screen.findByLabelText(label))
  const press = (f: ReturnType<typeof within>, name: RegExp | string, times = 1) => { for (let i = 0; i < times; i++) fireEvent.click(f.getByRole('button', { name })) }
  const next = (f: ReturnType<typeof within>, n: number) => press(f, /next step/i, n)

  it('er: all four embedded visuals render, and each one responds', async () => {
    const c = await visit('/concept/er-modelling?s=read', /Understand it/)
    for (const t of [/What each part of an ER drawing becomes/, /Read crow's-foot notation/, 'Where does the foreign key go?', /Design a schema step by step/]) {
      await screen.findByLabelText(t)
    }
    click('Relationship')
    await waitFor(() => expect(c.textContent).toMatch(/Becomes a FOREIGN KEY column/))
    click('Zero or many'); click('Zero or many')
    await waitFor(() => expect(c.textContent).toMatch(/Type:\s*many-to-many/))
    next(await fig('Design a schema step by step'), 5)
    await waitFor(() => expect(c.textContent).toMatch(/Step 5: Add primary and foreign keys/))
    expect(c.textContent).toMatch(/book_authors/)
  })
  it('keys: each join type keeps different rows', async () => {
    const c = await visit('/concept/keys?s=read', /Understand it/)
    await screen.findByLabelText(/See which rows each JOIN keeps/)
    await waitFor(() => expect(c.textContent).toMatch(/Result: 2 rows/))
    click('LEFT JOIN'); await waitFor(() => expect(c.textContent).toMatch(/Result: 3 rows/))
    click('FULL JOIN'); await waitFor(() => expect(c.textContent).toMatch(/Result: 4 rows/))
  })
  it('normalization: flat table decomposes and the update touches one row', async () => {
    const c = await visit('/concept/normalization?s=read', /Understand it/)
    next(await fig('Normalize a flat table, step by step'), 4)
    await waitFor(() => expect(c.textContent).toMatch(/Asha moves to Mumbai/))
    expect(c.textContent).toMatch(/→ 1 row/)
  })
  it('indexing: a query that skips the first column cannot use the composite index', async () => {
    const c = await visit('/concept/indexing?s=read', /Understand it/)
    await screen.findByLabelText(/leftmost-prefix rule/)
    await waitFor(() => expect(c.textContent).toMatch(/Index range scan/))
    click("status = 'paid'")
    await waitFor(() => expect(c.textContent).toMatch(/Full index scan/))
  })
  it('locks: MVCC steps through to VACUUM, deadlock ends in an abort', async () => {
    const c = await visit('/concept/locks-mvcc?s=read', /Understand it/)
    await screen.findByLabelText(/MVCC: how readers and writers avoid each other/)
    next(await fig('MVCC: how readers and writers avoid each other'), 5)
    await waitFor(() => expect(c.textContent).toMatch(/VACUUM removes dead versions/))
    const d = await fig('How a deadlock forms, and how ordering prevents it')
    next(d, 5)
    await waitFor(() => expect(c.textContent).toMatch(/deadlock detected/))
  })
  it('sharding: consistent hashing moves fewer keys than modulo', async () => {
    const c = await visit('/concept/sharding?s=read', /Understand it/)
    await screen.findByLabelText(/Consistent hashing: add a server/)
    click('Add server D')
    await waitFor(() => expect(c.textContent).toMatch(/Consistent hashing \(ring\)2/))
    expect(c.textContent).toMatch(/hash\(key\) mod N9/)
  })
  it('celery, wal and cache-aside visuals render and step', async () => {
    let c = await visit('/concept/celery-async?s=read', /Understand it/)
    const f1 = await fig('What happens to a Celery task'); press(f1, 'Worker crashes mid-task'); next(f1, 5)
    await waitFor(() => expect(c.textContent).toMatch(/emails sent: 2/))
    cleanup()
    c = await visit('/concept/acid?s=read', /Understand it/)
    const f2 = await fig('Crash recovery with the write-ahead log'); next(f2, 6)
    await waitFor(() => expect(c.textContent).toMatch(/That is Durability/))
    cleanup()
    c = await visit('/concept/consistency?s=read', /Understand it/)
    const f3 = await fig('Cache-aside: hit, miss and invalidation'); press(f3, 'Write: invalidate'); next(f3, 4)
    await waitFor(() => expect(c.textContent).toMatch(/cache: product:7 = v2/))
  })
})

describe('system design and production-ops lessons', () => {
  const click = (name: RegExp | string) => fireEvent.click(pick(name))
  const fig = async (label: string) => within(await screen.findByLabelText(label))
  const press = (f: ReturnType<typeof within>, name: RegExp | string, times = 1) => { for (let i = 0; i < times; i++) fireEvent.click(f.getByRole('button', { name })) }

  it('sysdesign: the numbers decide the architecture', async () => {
    const c = await visit('/concept/system-design', /Interactive/)
    const lab = inLab(c)
    const labClick = async (n: string) => fireEvent.click((await lab.findAllByRole('button', { name: n }))[0])
    await labClick('Small SaaS / blog')
    await waitFor(() => expect(c.textContent).toMatch(/One primary can handle the writes\. Do not shard yet/))
    await labClick('Chat app')
    await waitFor(() => expect(c.textContent).toMatch(/Because peak writes .* are above/))
    expect(c.querySelector('.archbox.on')).not.toBeNull()
  })
  it('sd-framework: six steps end at trade-offs', async () => {
    const c = await visit('/concept/system-design?s=read', /Understand it/)
    const f = await fig('Answer a design question in six steps')
    press(f, /next step/i, 6)
    await waitFor(() => expect(c.textContent).toMatch(/Step 6: State trade-offs and failure modes/))
  })
  it('migrate: one-step rename fails, expand-backfill-contract does not', async () => {
    const c = await visit('/concept/prod-ops', /Interactive/)
    const main = inLab(c)
    await main.findAllByRole('button', { name: /next step/i })
    press(main, /next step/i, 3)
    await waitFor(() => expect(c.textContent).toMatch(/column "name" does not exist/))
    press(main, /Expand, backfill, contract/)
    press(main, /next step/i, 6)
    await waitFor(() => expect(c.textContent).toMatch(/Contract: DROP COLUMN name/))
    expect(c.textContent).toMatch(/Done with zero errors/)
  })
  it('pool: too many instances exhaust connections, a pool caps them', async () => {
    const c = await visit('/concept/prod-ops?s=read', /Understand it/)
    const f = await fig('Connection pools: why 3 servers can break a database')
    fireEvent.change(f.getByLabelText('App instances'), { target: { value: '12' } })
    await waitFor(() => expect(c.textContent).toMatch(/too many clients already/))
    press(f, /Shared pool/)
    await waitFor(() => expect(c.textContent).toMatch(/share 40 real connections/))
  })
})

describe('tracks and the new lessons', () => {
  const click = (name: RegExp | string) => fireEvent.click(pick(name))
  const next = (n: number) => { for (let i = 0; i < n; i++) click(/next step/i) }

  it('home groups lessons into tracks', async () => {
    const c = await visit('/', /Learn how it really works/)
    const bar = c.querySelector('nav.trackbar') as HTMLElement
    for (const t of [/Database engineering/, /Python and Django core/, /Behavioral and interview skills/, /Data structures and algorithms/, /Low-level design/, /Git, containers and deployment/]) {
      expect(bar.textContent).toMatch(t)
    }
    expect(c.querySelectorAll('.track').length).toBeGreaterThanOrEqual(4)
    expect(c.textContent).toMatch(/Behavioral Interviews and STAR Stories/)
  })
  it('lessons without SQL do not show an SQL section', async () => {
    const c = await visit('/concept/behavioral-star?s=check', /Check yourself: interview questions/)
    expect(c.textContent).not.toMatch(/In SQL/)
    expect(c.querySelector('#sql')).toBeNull()
    expect(c.querySelector('#django')).toBeNull()
    expect(c.querySelector('#interview')).not.toBeNull()
    expect(c.querySelector('nav.lesson-steps')?.textContent).not.toMatch(/SQL|Code/)
  })
  it('bigo: growth table and the list-vs-set comparison', async () => {
    const c = await visit('/concept/big-o-structures', /Interactive/)
    const lab = inLab(c)
    await waitFor(() => expect(c.textContent).toMatch(/O\(n²\)/))
    fireEvent.click((await lab.findAllByRole('button', { name: /Pick the data structure/ }))[0])
    await waitFor(() => expect(c.textContent).toMatch(/x in seen_set/))
  })
  it('algo: binary search finds 91 in 4 looks, BFS reaches G in 3 hops', async () => {
    const c = await visit('/concept/coding-patterns', /Interactive/)
    const lab = inLab(c)
    const labClick = async (n: string | RegExp) => fireEvent.click((await lab.findAllByRole('button', { name: n }))[0])
    const labNext = async (k: number) => { for (let i = 0; i < k; i++) await labClick(/next step/i) }
    await labClick('Find 91'); await labNext(5)
    await waitFor(() => expect(c.textContent).toMatch(/Found after 4 looks/))
    await labClick('BFS (graph)'); await labNext(9)
    await waitFor(() => expect(c.textContent).toMatch(/G is 3 hops from A/))
  })
  it('python-internals: mutable default is shared between calls', async () => {
    const c = await visit('/concept/python-internals', /Interactive/)
    stageNext(c, 2)
    await waitFor(() => expect(c.textContent).toMatch(/Second call: f\(2\)/))
    expect(c.textContent).toMatch(/the same list, now \[1, 2\]/)
  })
  it('request cycle: response travels back out in reverse order', async () => {
    const c = await visit('/concept/django-request-cycle', /Interactive/)
    stageNext(c, 4)
    await waitFor(() => expect(c.textContent).toMatch(/Response travels back out/))
    click(/A middleware short-circuits/); stageNext(c, 2)
    await waitFor(() => expect(c.textContent).toMatch(/B rejects the request/))
  })
  it('auth: JWT cannot be revoked like a session', async () => {
    const c = await visit('/concept/auth-sessions-jwt', /Interactive/)
    click(/JWT: signed, not looked up/); stageNext(c, 4)
    await waitFor(() => expect(c.textContent).toMatch(/The catch: revocation/))
    expect(c.textContent).toMatch(/Long-lived JWT/)
  })
  it('git, docker and ci/cd scenes step through', async () => {
    let c = await visit('/concept/git-workflow', /Interactive/)
    stageNext(c, 3)
    await waitFor(() => expect(c.textContent).toMatch(/Merge feature into main/))
    cleanup()
    c = await visit('/concept/docker-containers', /Interactive/)
    stageNext(c, 3)
    await waitFor(() => expect(c.textContent).toMatch(/REBUILT/))
    cleanup()
    c = await visit('/concept/ci-cd-deploy', /Interactive/)
    stageNext(c, 2)
    await waitFor(() => expect(c.textContent).toMatch(/A test fails/))
  })
})

describe('every track has working lessons', () => {
  const click = (name: RegExp | string) => fireEvent.click(pick(name))
  const next = (n: number) => { for (let i = 0; i < n; i++) click(/next step/i) }

  it('the profile page offers every background', async () => {
    const c = await visit('/profile', /Build my roadmap/)
    const opts = [...c.querySelectorAll('select option')].map((o) => (o as HTMLOptionElement).value)
    for (const d of ['django', 'backend', 'student', 'sde', 'fullstack', 'frontend', 'data', 'devops', 'ml']) expect(opts).toContain(d)
  })
  it('home lists all twelve tracks', async () => {
    const c = await visit('/', /Learn how it really works/)
    const bar = (c.querySelector('nav.trackbar') as HTMLElement).textContent ?? ''
    for (const t of ['Database engineering', 'Python and Django core', 'Behavioral and interview skills', 'Data structures and algorithms', 'Low-level design', 'Computer science fundamentals', 'Git, containers', 'Frontend engineering', 'Data engineering', 'DevOps and reliability', 'Machine learning engineering', 'Scaling and distributed systems']) {
      expect(bar).toContain(t)
    }
  })
  it('new lessons across tracks step through their animations', async () => {
    const cases: [string, number, RegExp][] = [
      ['/concept/drf-internals', 5, /Valid data: save\(\) creates the object/],
      ['/concept/django-testing', 5, /When the run ends/],
      ['/concept/http-networking-basics', 5, /Render and fetch more/],
      ['/concept/cloud-basics', 5, /AZ a fails again/],
      ['/concept/js-event-loop', 4, /Now take one task/],
      ['/concept/react-rendering', 4, /Why purity matters/],
      ['/concept/web-performance-a11y', 5, /CLS: reserve space/],
      ['/concept/sql-analytics', 4, /Now compare each person with their department/],
      ['/concept/data-pipelines', 4, /Upsert: same result/],
      ['/concept/spark-batch', 4, /Each action can recompute/],
      ['/concept/observability-slos', 5, /Each signal did a different job/],
      ['/concept/incident-management', 6, /Blameless postmortem/],
      ['/concept/infrastructure-as-code', 4, /Apply again: nothing to do/],
      ['/concept/ml-fundamentals', 4, /Judge only on held-out data/],
      ['/concept/ml-production', 4, /The fix|Fix: one code path/],
      ['/concept/ml-system-design', 5, /Serve and monitor/],
    ]
    for (const [path, steps, text] of cases) {
      const c = await visit(path, /Interactive/)
      stageNext(c, steps)
      await waitFor(() => expect(c.textContent).toMatch(text))
      cleanup()
    }
  })
  it('non-database lessons never show an SQL heading unless they have SQL', async () => {
    const c = await visit('/concept/infrastructure-as-code?s=code', /Try it in code/)
    expect(c.textContent).not.toMatch(/In SQL/)
  })
})

describe('data structures, low-level design and interview-skills lessons', () => {
  const NEW = ['arrays-hashing', 'stacks-queues', 'linked-lists', 'sorting-searching', 'trees-bst', 'graphs-traversal', 'heaps-priority-queues',
    'recursion-backtracking', 'dynamic-programming', 'oop-solid', 'design-patterns', 'lld-parking-lot', 'lld-lru-cache', 'lld-state-machine',
    'interview-loop-formats', 'coding-interview-method', 'js-utility-functions', 'ui-coding-components', 'frontend-system-design',
    'llm-system-design', 'os-processes-memory', 'concurrency-basics',
    'sd-interview-framework', 'back-of-envelope-estimation', 'latency-throughput-availability', 'cap-consistency-patterns', 'dns-cdn-reverse-proxy',
    'microservices-communication', 'design-news-feed', 'design-web-crawler', 'design-key-value-store', 'design-chat-system', 'design-notification-system',
    'design-autocomplete', 'design-file-storage', 'design-video-streaming', 'design-proximity-service', 'design-payment-system',
    'ml-generalization-regularization', 'ml-metrics-experimentation', 'recommender-system-design', 'css-layout-responsive', 'react-state-management']
  it.each(NEW)('/concept/%s renders, steps through and has code and questions', async (slug) => {
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { const m = a.map(String).join(' '); if (!IGNORED.test(m)) errors.push(m) })
    try {
      const c = await visit(`/concept/${slug}?s=watch`, /Interactive/)
      await waitFor(() => expect(c.querySelector('.stage')).not.toBeNull())
      const rail = () => [...c.querySelectorAll<HTMLButtonElement>('.stage-rail button')]
      const n = rail().length
      expect(n).toBeGreaterThanOrEqual(6)
      const seen = new Set<string>()
      for (let i = 0; i < n; i++) {
        fireEvent.click(rail()[i])
        const skip = c.querySelector<HTMLButtonElement>('.linkish')
        if (skip) fireEvent.click(skip)
        await waitFor(() => expect(c.querySelector('.stage-text h4')?.textContent?.length ?? 0).toBeGreaterThan(3))
        seen.add(c.querySelector('.stage-text h4')!.textContent!)
      }
      expect(seen.size).toBe(n)
      // the rest of the lesson is on its own steps: questions on "Check yourself", sources on "Finish"
      const stepTo = async (label: RegExp, text: RegExp) => {
        fireEvent.click(within(c.querySelector('nav.lesson-steps') as HTMLElement).getByRole('button', { name: label }))
        await waitFor(() => expect(c.textContent).toMatch(text))
      }
      await stepTo(/Check yourself/, /interview questions/i)
      await stepTo(/Finish/, /Read & refer/)
      expect(errors).toEqual([])
    } finally { spy.mockRestore() }
  })
  it('the SDE roadmap leads with data structures and algorithms and explains its weighting', async () => {
    const start = new Date().toLocaleDateString('en-CA')
    localStorage.setItem('intervio.profile', JSON.stringify({ domain: 'sde', goal: 'interview', experience_years: 1.5, weeks: 10, hours_per_day: 2, days_per_week: 6, start_date: start }))
    const c = await visit('/my-plan', /Full schedule/)
    expect(c.textContent).toMatch(/big-company software engineer loops/)
    expect(c.textContent).toMatch(/Arrays and Hash Maps/)
    expect(c.textContent).toMatch(/Design an LRU Cache|The LLD Method/)
  })
})

describe('stage lessons: isometric step-through diagrams', () => {
  const STAGE = ['request-path', 'scaling-stateless', 'load-balancing', 'caching-at-scale', 'consistent-hashing', 'message-queues',
    'rate-limiting', 'timeouts-retries', 'consensus-leader-election', 'design-url-shortener',
    'memory-and-pointers', 'divide-and-conquer',
    'arrays', 'dynamic-arrays', 'in-place-two-pointers', 'sliding-window-strings', 'prefix-sums', 'maximum-subarray',
    'merge-intervals', 'pattern-matching', 'kmp-search', 'matrices-2d',
    'singly-linked-lists', 'doubly-linked-lists', 'fast-slow-pointers', 'reversing-a-list', 'merge-sorted-lists', 'lru-cache-linked-list',
    'stacks', 'balanced-brackets', 'queues', 'circular-buffer', 'deques', 'monotonic-stack', 'monotonic-queue',
    'hash-tables', 'collision-handling', 'resizing-rehashing', 'sets-and-maps', 'bloom-filters',
    'binary-trees', 'tree-traversals', 'lowest-common-ancestor', 'binary-search-trees', 'bst-deletion', 'balanced-trees', 'tries', 'segment-trees',
    'binary-heaps', 'building-a-heap', 'priority-queues', 'top-k', 'median-of-a-stream', 'heap-sort',
    'graph-representation', 'breadth-first-search', 'depth-first-search', 'connected-components', 'cycle-detection', 'topological-sort',
    'strongly-connected-components', 'shortest-paths', 'bellman-ford', 'floyd-warshall', 'union-find', 'minimum-spanning-trees', 'prims-algorithm',
    'binary-search', 'binary-search-on-the-answer', 'simple-sorts', 'merge-sort', 'quick-sort', 'quickselect', 'counting-radix-sort', 'stability-and-sorting-limits',
    'interval-scheduling', 'huffman-coding', 'when-greedy-fails',
    'subsets-and-combinations', 'permutations', 'n-queens', 'maze-solving']
  const rail = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('.stage-rail button')]
  const heading = (c: HTMLElement) => c.querySelector('.stage-text h4')?.textContent ?? ''

  it.each(STAGE)('%s: every step renders a diagram, text and no errors', async (slug) => {
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { const m = a.map(String).join(' '); if (!IGNORED.test(m)) errors.push(m) })
    try {
      const c = await visit(`/concept/${slug}`, /Interactive/)
      await waitFor(() => expect(c.querySelector('.stage')).not.toBeNull())
      const steps = rail(c)
      expect(steps.length).toBeGreaterThanOrEqual(8)
      const seen = new Set<string>()
      for (let i = 0; i < steps.length; i++) {
        fireEvent.click(rail(c)[i])
        const skip = c.querySelector<HTMLButtonElement>('.linkish')
        if (skip) fireEvent.click(skip)
        await waitFor(() => expect(heading(c).length).toBeGreaterThan(3))
        seen.add(heading(c))
        expect(c.querySelector('.stage-canvas svg'), `step ${i + 1} has no diagram`).not.toBeNull()
        expect(c.querySelectorAll('.stage-canvas svg .node:not(.gone)').length, `step ${i + 1} shows no nodes`).toBeGreaterThan(0)
        expect(c.querySelector('.stage-hud .hud'), `step ${i + 1} has no HUD`).not.toBeNull()
        expect(c.querySelector('.stage-text p:not(.stage-step)'), `step ${i + 1} has no explanation`).not.toBeNull()
        expect(c.querySelector('[role=alert]')).toBeNull()
      }
      expect(seen.size, 'every step should have its own title').toBe(steps.length)
      expect(errors).toEqual([])
    } finally { spy.mockRestore() }
  })

  const FORMER_WIDGETS = ['er-modelling', 'keys', 'normalization', 'denormalization', 'data-types', 'constraints', 'sql-vs-nosql', 'explain',
    'indexing', 'consistency', 'drf-api', 'web-security', 'system-design', 'big-o-structures', 'coding-patterns']
  it.each(FORMER_WIDGETS)('%s: stepped through, with its old widget kept as a lab', async (slug) => {
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { const m = a.map(String).join(' '); if (!IGNORED.test(m)) errors.push(m) })
    try {
      const c = await visit(`/concept/${slug}`, /Interactive/)
      await waitFor(() => expect(c.querySelector('.stage')).not.toBeNull())
      expect(c.querySelector('details.lab'), 'the old widget should remain as a lab').not.toBeNull()
      const steps = rail(c)
      expect(steps.length).toBeGreaterThanOrEqual(6)
      const seen = new Set<string>()
      for (let i = 0; i < steps.length; i++) {
        fireEvent.click(rail(c)[i])
        const skip = c.querySelector<HTMLButtonElement>('.linkish')
        if (skip) fireEvent.click(skip)
        await waitFor(() => expect(heading(c).length).toBeGreaterThan(3))
        seen.add(heading(c))
        expect(c.querySelector('.stage-text p:not(.stage-step)'), `step ${i + 1} has no explanation`).not.toBeNull()
        if (c.querySelector('.stage-canvas svg')) expect(c.querySelectorAll('.stage-canvas svg .node:not(.gone)').length, `step ${i + 1} shows no nodes`).toBeGreaterThan(0)
      }
      expect(seen.size, 'every step should have its own title').toBe(steps.length)
      expect(errors).toEqual([])
    } finally { spy.mockRestore() }
  })

  it('Next and Back move one step, the last step cannot go further', async () => {
    const c = await visit('/concept/load-balancing', /Interactive/)
    await waitFor(() => expect(c.querySelector('.stage')).not.toBeNull())
    const first = heading(c)
    const nextBtn = () => [...c.querySelectorAll<HTMLButtonElement>('.stage-nav button')].find((b) => /Next|End of lesson/.test(b.textContent ?? ''))!
    const backBtn = () => [...c.querySelectorAll<HTMLButtonElement>('.stage-nav button')].find((b) => /Back/.test(b.textContent ?? ''))!
    expect(backBtn().disabled).toBe(true)
    fireEvent.click(nextBtn())
    expect(heading(c)).not.toBe(first)
    fireEvent.click(backBtn())
    expect(heading(c)).toBe(first)
    const n = rail(c).length
    for (let i = 0; i < n + 3; i++) if (!nextBtn().disabled) fireEvent.click(nextBtn())
    expect(nextBtn().disabled).toBe(true)
    expect(nextBtn().textContent).toMatch(/End of lesson/)
  })

  it('arrow keys step, R replays and Space pauses', async () => {
    const c = await visit('/concept/rate-limiting', /Interactive/)
    await waitFor(() => expect(c.querySelector('.stage')).not.toBeNull())
    const stage = c.querySelector('.stage') as HTMLElement
    const first = heading(c)
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(heading(c)).not.toBe(first)
    fireEvent.keyDown(stage, { key: 'ArrowLeft' })
    expect(heading(c)).toBe(first)
    const pause = [...c.querySelectorAll<HTMLButtonElement>('.stage-tools button')].find((b) => /Pause|Resume/.test(b.textContent ?? ''))!
    expect(pause.getAttribute('aria-pressed')).toBe('false')
    fireEvent.keyDown(stage, { key: ' ' })
    expect(pause.getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(stage, { key: 'r' })
    expect(pause.getAttribute('aria-pressed')).toBe('false')
  })

  it('a predict step hides the explanation until you answer, then reveals it', async () => {
    const c = await visit('/concept/caching-at-scale', /Interactive/)
    await waitFor(() => expect(c.querySelector('.stage')).not.toBeNull())
    const i = rail(c).findIndex((b) => /Hit rate/.test(b.textContent ?? ''))
    fireEvent.click(rail(c)[i])
    expect(c.querySelector('.predict')).not.toBeNull()
    expect(c.querySelector('.scallout')).toBeNull()
    const right = [...c.querySelectorAll<HTMLButtonElement>('.predict .opt')].find((b) => /10 times less/.test(b.textContent ?? ''))!
    fireEvent.click(right)
    await waitFor(() => expect(c.querySelector('.scallout')).not.toBeNull())
    expect(c.textContent).toMatch(/Correct\./)
  })

  it('the diagram changes between steps: consistent hashing moves keys onto a ring', async () => {
    const c = await visit('/concept/consistent-hashing', /Interactive/)
    await waitFor(() => expect(c.querySelector('.stage')).not.toBeNull())
    const ringShown = () => c.querySelector('[data-node="ring"]:not(.gone)') !== null
    expect(ringShown()).toBe(false)
    fireEvent.click(rail(c).find((b) => /The ring/.test(b.textContent ?? ''))!)
    expect(ringShown()).toBe(true)
  })

  it('a failed node is marked down for assistive technology as well', async () => {
    const c = await visit('/concept/load-balancing', /Interactive/)
    await waitFor(() => expect(c.querySelector('.stage')).not.toBeNull())
    fireEvent.click(rail(c).find((b) => /Health checks/.test(b.textContent ?? ''))!)
    const list = c.querySelector('.stage-canvas .sr-only')?.textContent ?? ''
    expect(list).toMatch(/down/)
  })
})


describe('problem bank, step links and problem links', () => {
  it('lists the problems grouped by lesson, with difficulty', async () => {
    const c = await visit('/problems', /Problem bank/)
    await waitFor(() => expect(c.querySelectorAll('.problem-list li').length).toBeGreaterThanOrEqual(35))
    expect(c.textContent).toMatch(/Two Sum/)
    expect(c.textContent).toMatch(/Edit Distance/)
    fireEvent.click(within(c).getByRole('button', { name: 'hard' }))
    expect(c.querySelectorAll('.problem-list li').length).toBe(1)
  })

  it('a problem opens with its statement and starter code and marks it solved when every test passes', async () => {
    runMock.next = { results: [] }
    const c = await visit('/problems/two-sum', /Your code/)
    await waitFor(() => expect((c.querySelector('textarea.editor') as HTMLTextAreaElement).value).toMatch(/def two_sum/))
    expect(c.textContent).toMatch(/indices \[i, j\]/)
    fireEvent.click(within(c).getByRole('button', { name: 'Run tests' }))
    await waitFor(() => expect(c.textContent).toMatch(/All tests passed/))
    expect(JSON.parse(localStorage.getItem('intervio.solved') ?? '[]')).toContain('two-sum')
    expect(c.querySelectorAll('.case-list li.ok').length).toBeGreaterThanOrEqual(4)
  })

  it('failing tests, a stopped run and a syntax error are each reported, and nothing is marked solved', async () => {
    const c = await visit('/problems/two-sum', /Your code/)
    await waitFor(() => expect(c.querySelector('textarea.editor')).not.toBeNull())
    runMock.next = { results: [{ name: 'basic', ok: false, error: 'wrong answer' }, { name: 'duplicates', ok: true }] }
    fireEvent.click(within(c).getByRole('button', { name: 'Run tests' }))
    await waitFor(() => expect(c.textContent).toMatch(/1 of 2 tests passed/))
    expect(c.querySelector('.case-list li.bad')?.textContent).toMatch(/wrong answer/)
    runMock.next = { results: [], stopped: true }
    fireEvent.click(within(c).getByRole('button', { name: 'Run tests' }))
    await waitFor(() => expect(c.textContent).toMatch(/Stopped\./))
    runMock.next = { results: [], error: 'SyntaxError: invalid syntax' }
    fireEvent.click(within(c).getByRole('button', { name: 'Run tests' }))
    await waitFor(() => expect(c.textContent).toMatch(/did not run/))
    expect(localStorage.getItem('intervio.solved')).toBeNull()
    runMock.next = { results: [] }
  })

  it('hints are revealed one at a time and the solution only on request', async () => {
    const c = await visit('/problems/two-sum', /Your code/)
    await waitFor(() => expect(c.querySelector('textarea.editor')).not.toBeNull())
    expect(c.textContent).not.toMatch(/Reference solution/)
    fireEvent.click(within(c).getByRole('button', { name: /^Hint 0\// }))
    await waitFor(() => expect(c.querySelectorAll('.card ol li').length).toBe(1))
    fireEvent.click(within(c).getByRole('button', { name: 'Show a reference solution' }))
    await waitFor(() => expect(c.textContent).toMatch(/Reference solution/))
  })

  it('a data structures lesson links to its problems', async () => {
    const c = await visit('/concept/arrays-hashing?s=practice', /Common mistakes/)
    await waitFor(() => expect(c.textContent).toMatch(/Practice in the problem bank/))
    expect(c.querySelector('a[href="/problems/two-sum"]')).not.toBeNull()
  })

  it('the step of a lesson is in the URL: a link opens at that step, and Next updates it', async () => {
    const c = await visit('/concept/load-balancing#scene=1&step=3', /Interactive/)
    await waitFor(() => expect(c.querySelector('.stage')).not.toBeNull())
    expect(c.querySelector('.stage-step')?.textContent).toMatch(/3\s*\/\s*\d+/)
    stageNext(c, 1)
    await waitFor(() => expect(window.location.hash).toBe('#scene=1&step=4'))
    window.history.pushState({}, '', '/')
  })
})

describe('no deadline', () => {
  it('the profile form offers it, and by default', async () => {
    const c = await visit('/profile', /Build my roadmap/)
    const box = c.querySelector<HTMLInputElement>('label.check input[type=checkbox]')!
    expect(box.checked).toBe(true)
    expect((c.querySelector('input[type=number][placeholder="no deadline"]') as HTMLInputElement).disabled).toBe(true)
    await waitFor(() => expect(c.textContent).toMatch(/Nothing is cut/))
    fireEvent.click(box)
    expect((c.querySelector('input[type=number][placeholder="no deadline"]') as HTMLInputElement).disabled).toBe(false)
  })

  it('a plan with no deadline keeps every lesson and says how long it takes', async () => {
    const start = new Date().toLocaleDateString('en-CA')
    localStorage.setItem('intervio.profile', JSON.stringify({ domain: 'sde', goal: 'interview', experience_years: 1.5, weeks: 0, hours_per_day: 2, days_per_week: 6, start_date: start }))
    const c = await visit('/my-plan', /Full schedule/)
    expect(c.textContent).toMatch(/no deadline/)
    expect(c.textContent).not.toMatch(/What I had to cut/)
    expect(c.textContent).toMatch(/No deadline: this plan keeps every lesson/)
  })
})

describe('everyday examples', () => {
  it('every lesson opens with a plain sentence, a story, a table of what each part means, and the hard words', async () => {
    for (const slug of ['caching-at-scale', 'arrays-hashing', 'keys']) {
      const c = await visit(`/concept/${slug}`, /Picture it first/)
      expect(c.querySelector('p.plain')?.textContent?.length).toBeGreaterThan(20)
      expect(c.textContent).toMatch(/What each part of the story means/)
      expect(c.querySelectorAll('.everyday tbody tr').length).toBeGreaterThanOrEqual(2)
      expect(c.textContent).toMatch(/Words you will meet/)
      expect(c.querySelectorAll('dl.words dt').length).toBeGreaterThanOrEqual(3)
      cleanup()
    }
  })
})

describe('a lesson is a short course', () => {
  it('opens on the story, shows where you are, and Continue moves one step at a time', async () => {
    const c = await visit('/concept/acid', /Picture it first/)
    expect(c.textContent).toMatch(/Step 1 of \d/)
    expect(c.querySelector('nav.lesson-steps li.cur')?.textContent).toMatch(/Picture it/)
    // only the story is on screen: no animation, no explanation, no quiz yet
    expect(c.querySelector('.stage')).toBeNull()
    expect(c.textContent).not.toMatch(/Understand it/)
    fireEvent.click(within(c).getByRole('button', { name: /^Continue: Watch it/ }))
    await waitFor(() => expect(c.querySelector('.stage')).not.toBeNull(), { timeout: 15000 })
    expect(c.textContent).toMatch(/Step 2 of \d/)
    expect(window.location.search).toBe('?s=watch')
    fireEvent.click(within(c).getByRole('button', { name: /^Continue: Read/ }))
    await waitFor(() => expect(c.textContent).toMatch(/Understand it/))
    expect(c.querySelector('.stage')).toBeNull()
    fireEvent.click(within(c).getByRole('button', { name: /← Back/ }))
    await waitFor(() => expect(c.querySelector('.stage')).not.toBeNull(), { timeout: 15000 })
  })

  it('a step can be linked to, and the last step offers the next lesson', async () => {
    const c = await visit('/concept/acid?s=finish', /Why this priority\?/)
    expect(c.querySelector('nav.lesson-steps li.cur')?.textContent).toMatch(/Finish/)
    expect(within(c).getByRole('link', { name: /Next lesson/ })).toBeTruthy()
  })

  it('lessons without code skip the Code step', async () => {
    const c = await visit('/concept/behavioral-star', /Picture it first/)
    expect(c.querySelector('nav.lesson-steps')?.textContent).not.toMatch(/Code|SQL/)
  })
})

describe('appearance: colour and font', () => {
  it('the top bar offers palettes and fonts, applies the choice and remembers it', async () => {
    localStorage.removeItem('intervio.look')
    const c = await visit('/', /Learn how it really works/)
    expect(document.documentElement.dataset.palette).toBe('ocean')
    expect(document.documentElement.dataset.font).toBe('jakarta')
    fireEvent.click(within(c).getByRole('button', { name: /Appearance/ }))
    const dialog = await within(c).findByRole('dialog', { name: /Colour and font/ })
    for (const name of [/Ocean/, /Sage/, /Lavender/, /Paper/, /Plus Jakarta Sans/, /Atkinson Hyperlegible/, /Source Serif/, /DM Sans/]) {
      expect(within(dialog).getByRole('button', { name })).toBeTruthy()
    }
    fireEvent.click(within(dialog).getByRole('button', { name: /^Lavender/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Atkinson Hyperlegible/ }))
    await waitFor(() => expect(document.documentElement.dataset.palette).toBe('lavender'))
    expect(document.documentElement.dataset.font).toBe('atkinson')
    expect(JSON.parse(localStorage.getItem('intervio.look') ?? '{}')).toEqual({ palette: 'lavender', font: 'atkinson' })
    localStorage.removeItem('intervio.look')
    document.documentElement.dataset.palette = 'ocean'
    document.documentElement.dataset.font = 'jakarta'
  })
})

describe('bugs that were fixed', () => {
  /** Replace fetch for the length of one test: `handler` answers the calls it knows and returns undefined for the rest. */
  async function withFetch(handler: (url: string, init?: RequestInit) => Response | undefined, body: () => Promise<void>) {
    const before = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init) ?? before(input, init))
    try { await body() } finally { vi.stubGlobal('fetch', before) }
  }
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

  it('the Tab key in the code editor keeps the caret after the inserted spaces', async () => {
    const c = await visit('/problems/two-sum', /Your code/)
    const box = within(c).getByLabelText('Python code') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'ab' } })
    box.selectionStart = box.selectionEnd = 1
    fireEvent.keyDown(box, { key: 'Tab' })
    expect(box.value).toBe('a    b')
    await waitFor(() => expect(box.selectionStart).toBe(5))   // it used to jump to the end of the text (6)
    expect(box.selectionEnd).toBe(5)
  })

  it('progress made while signed out is moved into the account at sign-in', async () => {
    localStorage.setItem('intervio.token', 'tok')
    localStorage.setItem('intervio.user', 'sam')
    localStorage.setItem('intervio.progress', JSON.stringify(['concept:acid', 'concept:keys', 'not a key']))
    const sent: string[] = []
    await withFetch((url, init) => {
      if (url.includes('/api/progress/toggle/')) {
        const key = JSON.parse(String(init?.body)).key as string
        sent.push(key)
        return key === 'not a key' ? json({ error: 'Invalid key.' }, 400) : json({ key, done: true })
      }
      if (url.includes('/api/progress/')) return json({ keys: ['concept:acid'] })   // the account already has this one
      if (url.includes('/api/profile/')) return json({ profile: null })
    }, async () => {
      await visit('/', /Learn how it really works/)
      await waitFor(() => expect(localStorage.getItem('intervio.progress')).toBe('[]'))
      expect(sent).toEqual(['concept:keys', 'not a key'])   // only what the account lacked, and the bad key is skipped, not fatal
    })
  })

  it('a rejected saved token does not turn a public page into an error', async () => {
    localStorage.setItem('intervio.token', 'stale')
    localStorage.setItem('intervio.user', 'sam')
    const withToken: (string | undefined)[] = []
    await withFetch((url, init) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      withToken.push(auth)
      if (auth) return json({ detail: 'Invalid token.' }, 401)
    }, async () => {
      const c = await visit('/', /Learn how it really works/)
      expect(c.textContent).not.toMatch(/service is down/)
    })
    expect(localStorage.getItem('intervio.token')).toBeNull()   // forgotten, so the next request is made as a visitor
    expect(withToken.some((a) => a === undefined)).toBe(true)
  })
})
