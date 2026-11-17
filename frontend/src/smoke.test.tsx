// Render smoke test: mounts the real <App/> against the live Django API (http://127.0.0.1:8000)
// and visits every page and every animation. Fails on any crash or error-boundary screen.
// Run:  npm test   (Django must be running)
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'

const API = 'http://127.0.0.1:8000'

beforeAll(() => {
  const real = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    real(typeof input === 'string' && input.startsWith('/') ? API + input : input, init))
  window.scrollTo = () => {}
})
afterEach(() => { cleanup(); localStorage.clear() })

const IGNORED = /not wrapped in act|ReactDOMTestUtils/

async function visit(path: string, expectText: RegExp) {
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
    expect(container.querySelector('[role=alert]'), 'error boundary is showing').toBeNull()
    expect(errors, 'console errors').toEqual([])
    return container
  } finally { spy.mockRestore() }
}

describe('pages render', () => {
  const pages: [string, RegExp][] = [
    ['/', /Learn how databases really work/],
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
    const c = await visit(`/concept/${slug}`, /Why this priority\?/)
    expect(c.textContent).toMatch(/Read & refer/)
    expect(c.textContent).toMatch(/interview questions/i)
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
  const click = (name: RegExp) => fireEvent.click(screen.getAllByRole('button', { name })[0])

  it('N+1: switching strategy changes the query count', async () => {
    const c = await visit('/concept/django-orm', /Interactive/)
    await screen.findAllByText(/queries:/)
    click(/Run the page/)
    await waitFor(() => expect(c.querySelector('.querylog code')).not.toBeNull())
    click(/select_related/)
    await waitFor(() => expect(c.textContent).toMatch(/1 query no matter how many orders/))
  })
  it('on_commit race: steps through both versions', async () => {
    const c = await visit('/concept/celery-async', /Interactive/)
    await screen.findByText(/Web request/)
    click(/next step/i); click(/next step/i); click(/next step/i)
    await waitFor(() => expect(c.textContent).toMatch(/DoesNotExist/))
    click(/transaction\.on_commit/)
    await waitFor(() => expect(c.textContent).not.toMatch(/FAILED/))
  })
  it('lock race: naive then atomic', async () => {
    const c = await visit('/concept/locks-mvcc', /Interactive/)
    await screen.findByText(/Buyer|Predict/)
    for (let i = 0; i < 4; i++) click(/next step/i)
    await waitFor(() => expect(c.textContent).toMatch(/Oversold/))
    click(/Atomic conditional UPDATE/)
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
  it('shows the Interactive panel on all 19 concept pages', async () => {
    const res = await fetch('/api/content/')
    const content = await res.json() as { concepts: { slug: string; viz: string }[] }
    expect(content.concepts.length).toBe(19)
    expect(content.concepts.filter((c) => !c.viz)).toEqual([])
  })
})

describe('new animations respond to interaction', () => {
  const click = (name: RegExp | string) => fireEvent.click(screen.getAllByRole('button', { name })[0])
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
    await waitFor(() => expect(c.textContent).toMatch(/Every customer leaked/))
    click(/IDOR/)
    await waitFor(() => expect(c.textContent).toMatch(/Asha just read Ravi's order/))
    click(/Authorizes the object/)
    await waitFor(() => expect(c.textContent).toMatch(/404/))
  })
})

describe('visuals embedded in lessons', () => {
  const click = (name: RegExp | string) => fireEvent.click(screen.getAllByRole('button', { name })[0])
  /** Work inside one embedded visual (pages also contain older animations with their own buttons). */
  const fig = async (label: string) => within(await screen.findByLabelText(label))
  const press = (f: ReturnType<typeof within>, name: RegExp | string, times = 1) => { for (let i = 0; i < times; i++) fireEvent.click(f.getByRole('button', { name })) }
  const next = (f: ReturnType<typeof within>, n: number) => press(f, /next step/i, n)

  it('er: all four embedded visuals render, and each one responds', async () => {
    const c = await visit('/concept/er-modelling', /Interactive/)
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
    const c = await visit('/concept/keys', /Interactive/)
    await screen.findByLabelText(/See which rows each JOIN keeps/)
    await waitFor(() => expect(c.textContent).toMatch(/Result: 2 rows/))
    click('LEFT JOIN'); await waitFor(() => expect(c.textContent).toMatch(/Result: 3 rows/))
    click('FULL JOIN'); await waitFor(() => expect(c.textContent).toMatch(/Result: 4 rows/))
  })
  it('normalization: flat table decomposes and the update touches one row', async () => {
    const c = await visit('/concept/normalization', /Interactive/)
    next(await fig('Normalize a flat table, step by step'), 4)
    await waitFor(() => expect(c.textContent).toMatch(/Asha moves to Mumbai/))
    expect(c.textContent).toMatch(/→ 1 row/)
  })
  it('indexing: a query that skips the first column cannot use the composite index', async () => {
    const c = await visit('/concept/indexing', /Interactive/)
    await screen.findByLabelText(/leftmost-prefix rule/)
    await waitFor(() => expect(c.textContent).toMatch(/Index range scan/))
    click("status = 'paid'")
    await waitFor(() => expect(c.textContent).toMatch(/Full index scan/))
  })
  it('locks: MVCC steps through to VACUUM, deadlock ends in an abort', async () => {
    const c = await visit('/concept/locks-mvcc', /Interactive/)
    await screen.findByLabelText(/MVCC: how readers and writers avoid each other/)
    next(await fig('MVCC: how readers and writers avoid each other'), 5)
    await waitFor(() => expect(c.textContent).toMatch(/VACUUM removes dead versions/))
    const d = await fig('How a deadlock forms, and how ordering prevents it')
    next(d, 5)
    await waitFor(() => expect(c.textContent).toMatch(/deadlock detected/))
  })
  it('sharding: consistent hashing moves fewer keys than modulo', async () => {
    const c = await visit('/concept/sharding', /Interactive/)
    await screen.findByLabelText(/Consistent hashing: add a server/)
    click('Add server D')
    await waitFor(() => expect(c.textContent).toMatch(/Consistent hashing \(ring\)2/))
    expect(c.textContent).toMatch(/hash\(key\) mod N9/)
  })
  it('celery, wal and cache-aside visuals render and step', async () => {
    let c = await visit('/concept/celery-async', /Interactive/)
    const f1 = await fig('What happens to a Celery task'); press(f1, 'Worker crashes mid-task'); next(f1, 5)
    await waitFor(() => expect(c.textContent).toMatch(/emails sent: 2/))
    cleanup()
    c = await visit('/concept/acid', /Interactive/)
    const f2 = await fig('Crash recovery with the write-ahead log'); next(f2, 6)
    await waitFor(() => expect(c.textContent).toMatch(/That is Durability/))
    cleanup()
    c = await visit('/concept/consistency', /Interactive/)
    const f3 = await fig('Cache-aside: hit, miss and invalidation'); press(f3, 'Write: invalidate'); next(f3, 4)
    await waitFor(() => expect(c.textContent).toMatch(/cache: product:7 = v2/))
  })
})
