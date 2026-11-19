# Intervio

Learn engineering for interviews: 99 lessons in 12 tracks (database, Python and Django, behavioral and interview skills, data structures and algorithms, low-level design, computer science fundamentals, scaling and distributed systems, delivery, frontend, data, DevOps, ML), a 12-week plan, SQL drills, interactive animations, and spaced-repetition flashcards. Database lessons include a Django ORM section.

- **Backend:** Django 5.2 + Django REST Framework (`backend/`), SQLite by default, PostgreSQL via env vars
- **Frontend:** React + TypeScript + Vite + Framer Motion (`frontend/`)
- **Content:** JSON in `backend/content/` is the source of truth; `seed_content` loads it into the DB

## Run it (Windows)

Backend (always inside the virtual environment):

```powershell
cd backend
python -m venv .venv                      # first time only
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py seed_content
.venv\Scripts\python manage.py runserver  # http://127.0.0.1:8000
```

Frontend (second terminal):

```powershell
cd frontend
npm install
npm run dev                               # http://localhost:5173  (proxies /api to Django)
```

Tests: `cd backend; .venv\Scripts\python manage.py test` (90 tests) · Type-check + build: `cd frontend; npm run build` · Render and interaction test of every page and animation: `cd frontend; npm test` (167 tests, needs the Django server running; on Windows run it from PowerShell, because Git Bash picks a different Node)

## Use PostgreSQL instead of SQLite

Set these before `migrate` / `runserver`: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`.
For production also set `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`.

## Edit or add content

Edit the JSON in `backend/content/` (or use `/admin`), then run `manage.py seed_content` (idempotent; user progress is kept). Every concept has an animation. A concept's `viz` field selects it from `frontend/src/viz/` (er, fk, normalize, denorm, types, constraints, sqlnosql, plan, index, atomic, isolation, lock, replication, sharding, cache, nplus1, pagination, oncommit, security, sysdesign, migrate, bigo, algo), or is data-driven (`scenes`, `stage`: see below). Each follows the same loop: predict, watch, break it. A test fails if a concept has no animation.

Every concept carries `basis` + `sources` and every domain topic must cite at least one source (enforced by tests). Sources live in `backend/content/sources.json` and are labelled `read` (read in full) or `snippet` (search summary only). Only add reference links you have opened.

## API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/content/` | public | all levels, concepts, plan, exercises, drills, questions |
| `POST /api/auth/register/`, `/login/` | public (throttled) | returns a token |
| `POST /api/roadmap/` | public (throttled) | profile in, day-by-day schedule + cuts + reading list out |
| `GET /api/profile/`, `PUT /api/profile/` | token | saved profile (background, goal, experience, weeks, hours/day, days/week, start date) |
| `GET /api/progress/`, `POST /api/progress/toggle/` | token | completion keys like `concept:acid`, `plan:3:2` |
| `GET /api/flashcards/`, `POST /api/flashcards/<id>/review/` | token | Leitner spaced repetition |

Progress works without an account (saved in the browser); signing in syncs it to the server.

## How the animations teach

Each animation follows the same loop: **predict** the outcome, **watch** it step by step, then **break it** on purpose (remove the lock, pick a bad shard key, lower selectivity) to see why the safeguard exists.

## Lesson text markup

A concept's `explain` is a list of strings. A string starting with `## ` is a subheading, `> ` is a worked example, lines starting `- ` form a bullet list, and `@viz:<id>` embeds a small interactive visual at that point in the reading (ids in `frontend/src/viz/inline/index.tsx`: er-anatomy, er-notation, er-design, fk-side, joins, decompose, composite-index, mvcc, deadlock, hashring, celery-flow, wal, cache-aside, sd-framework, pool). Tests fail if a marker names an unknown visual, or if a lesson is under 350 words.

## Tracks and data-driven animations

`backend/content/tracks.json` defines the tracks. Each level in `levels.json` belongs to one track (`"track": "python-django"`), and each concept belongs to a level. The roadmap schedules lessons from every track. To add a lesson, append an entry to `concepts.json` with a level from the track you want and a `basis` plus `sources` (keys from `sources.json`, each opened and read before it is added).

A lesson needs an animation. Set `viz` to a built-in id (see `frontend/src/viz/index.tsx`), or set `"viz": "scenes"` and describe the animation as data in a `scenes` list, with no React code: each scene has an optional `predict` question and `steps`, and each step has a `title`, a `note` and `blocks` of type `text`, `list`, `code`, `table` (optional `tones`: good, bad, wait, changed), `flow` (a chain of boxes with a state) or `chips`. Tests validate every scene (predict answer in range, table row widths, known block types).

Beyond SQL, `sql` entries can carry `lang` (`py`, `sh`) and the page labels that section "Try it in code". An empty `sql` or `django` hides the section.

## Learner backgrounds and roadmaps

The profile's background (`django`, `backend`, `student`, `sde`, `fullstack`, `frontend`, `data`, `devops`, `ml`) decides which tracks the roadmap schedules (`TRACKS_FOR_DOMAIN` in `backend/learn/roadmap.py`), so a frontend learner gets frontend, data structures and algorithms, behavioral and delivery lessons and no database or Django capstone. Each role also re-weights lessons (see 'Interview standards by role'). All tracks stay readable on the home page. A background's roadmap states which tracks it covers, and every cut it makes, in its notes.

**Mixing tracks and fair cuts.** The scheduler used to work through the lessons in order, so the database track (the biggest) filled the first weeks and, when time was short, the non-database lessons were cut first because they come later. Now: (1) after the cuts, lessons are interleaved across tracks, always taking the next lesson from the track that is furthest behind, with the order inside each track unchanged and the capstone and mock interviews kept at the end; (2) optional lessons are cut from every track in proportion to its size, with the database track weighted (`DB_CUT_WEIGHT`) to give up time first; (3) the first lesson of every track is kept until everything else has been cut, so even a short plan touches every subject; (4) if a cut plan still gives the database more than `DB_SHARE_CAP` (55%, my judgment, not a sourced number) of its minutes, database practice is trimmed to 60% and the freed time is spent on cut lessons from other tracks (their practice at half time). Core (priority 1) lessons are never cut, and most core lessons are in the database track, so a plan under about 8 weeks at 2 h/day is still database-heavy and cannot fit every core lesson. Measured for a 1.5-year Django learner at 2 h/day, 6 days/week: 8 weeks gives database 51 h, Python/Django 22 h, problem solving 12 h, system design 3 h, delivery 7 h (54% database); 12 weeks gives 72 / 25 / 14 / 15 / 14 h (52%). `TrackBalanceTests` covers this.

The scaling and distributed systems track is scheduled for the `django`, `backend`, `student`, `sde`, `fullstack` and `devops` backgrounds. All ten of its lessons are priority 2 ("important, after the essentials"): that is my judgment for a learner with about 1.5 years of experience, and the roadmap cuts them first when time is short. Adding them, and then the data structures and low-level design tracks, made the full Django roadmap longer, so the default tests now use 36 weeks. `request-path` and `scaling-stateless` are treated as foundation lessons that experience shortens.

## The look: app shell and theme

The whole app was restyled after the reference's look: a warm paper theme with a matching warm dark theme (toggle in the top bar, saved in the browser, light by default), JetBrains Mono as the one typeface, a top bar with tabs (a pale green active tab with a dark outline and offset shadow), a course sidebar (tracks as folders with progress, lessons with done marks, a progress bar), and a `Ctrl K` search palette over lessons and pages. On screens under 1000 px the sidebar becomes a drawer behind a menu button and the tabs move into it. The font loads from Google Fonts; offline it falls back to the system monospace. Code: `frontend/src/components/Chrome.tsx`, `theme.ts`, and the tokens at the top of `styles.css`. Text is monospace everywhere, including long lessons, because that is how the reference does it; it reads wider than a proportional font.

## Stage: isometric step-through diagrams

All 99 lessons use a data-driven animation engine, `"viz": "stage"` (`frontend/src/viz/StageViz.tsx`, shapes in `viz/stage/`). A lesson is JSON: a set of nodes on an isometric floor, the links between them, and a list of steps. Each step carries the explanation and a `set` patch that changes the picture, so the diagram morphs from one step to the next (nodes glide, fade in and out, change colour, go down, show a load meter). Writing a new diagram needs no React code.

What the learner gets on every stage lesson: a row of live metrics (the HUD, with good, warn and bad tones), the diagram with packets travelling along the links, a legend, a numbered step rail, a text panel with the step's tag (problem, technique, solution, key idea, case), a callout (good to know, watch out, key idea), a "what changed" list, a "you will learn" checklist that ticks as they go, Back and Next buttons, Replay and Pause, and keyboard control (click the diagram, then `←` `→` to step, `R` to replay, `Space` to pause). Selected steps ask a prediction first and hide the explanation until you answer or skip; the right or wrong answer and its reason stay on screen afterwards.

How a stage scene is written (stored in the concept's `scenes`, one entry per diagram):

```json
{ "kind": "stage", "id": "cache", "title": "Cache-aside, step by step",
  "legend": [{ "kind": "request", "label": "request" }],
  "learn":  [{ "text": "Why hit rate matters", "at": 4 }],
  "nodes":  [{ "id": "app", "kind": "cube", "x": 0, "y": 2, "label": "App\nServer", "icon": "server", "tone": "blue" },
             { "id": "cache", "kind": "cube", "x": 2, "y": 0, "label": "Cache", "icon": "bolt", "tone": "green", "from": 2 }],
  "links":  [{ "a": "app", "b": "cache", "from": 2 }],
  "steps":  [{ "title": "Add a cache beside the app", "tag": "technique", "body": ["..."],
               "hud": [{ "k": "p95 latency", "v": "450 ms", "tone": "bad" }],
               "set": { "cache": { "pill": { "text": "empty: first read misses", "tone": "orange" } }, "app": { "load": 92, "status": "hot" } },
               "flows": [{ "path": ["app", "cache"], "kind": "query", "n": 2 }],
               "card": { "title": "Django", "lines": ["cache.get(key)"], "hl": [0] },
               "changes": ["+ A cache next to the app servers"],
               "callout": { "kind": "tip", "text": "..." },
               "predict": { "question": "...", "options": ["..."], "answer": 0, "why": "..." } }] }
```

- Node kinds: `cube` (a service), `db` (cylinder), `crowd` (a platform of people), `device` (`laptop` or `phone`), `dot` (a key or token), `zone` (a dashed region), `ring` (a ring on the floor). Tones: blue, orange, purple, green, yellow, grey, red, teal. About 30 icons are built in (`viz/stage/icons.tsx`).
- `from` and `until` show a node or link only on some steps. A `set` patch merges forward: `x` and `y` move a node, `pill` floats a label above it, `load` shows a 0 to 100 meter, `status` is `ok`, `down`, `hot` or `dim`, `hidden` removes it, `label` and `tone` change it. A step that omits `hud` keeps the previous metrics.
- `flows` send packets along a path of node ids. The kind must appear in the scene's `legend` (request, response, query, write, event, sync, token, fail and heartbeat have colours).
- Positions are world cells. The authoring helper I used converts screen pixels to cells and computes ring positions; it lives in my scratch folder and is not part of the repo, so new scenes are written as plain JSON. The consistent-hashing lesson computes which server owns each key from the positions, so the colours in that animation are correct by construction.
- Packets use SVG animation and respect `prefers-reduced-motion`. The diagram has a text equivalent: a hidden list of every visible node and its status, the HUD is announced, and the step list is a real navigation landmark. On phones the diagram scrolls sideways (with a hint) because its text would be too small to read if it were shrunk to fit.

Tests: `StageSceneTests` in `backend/learn/tests.py` validates every scene (known node kinds and tones, links and patches point at real nodes, flows use a legended kind, predict answers in range, the first step sets the HUD, each lesson cites sources and says what is judgment). The frontend tests click through every step of all ten lessons, and check the Next and Back buttons, the keyboard shortcuts, the prediction gate and that a failed node is announced as down. A browser audit (Playwright with Edge, run by hand) checked every step of every lesson in dark and light for clipped nodes, labels wider than their pill and labels covering a neighbouring node; it found and fixed three layouts.

## Scaling and distributed systems track

Ten lessons in `backend/content/concepts.json`, level 13, track `system-design`. Each is a stage diagram plus a full written lesson, code you can run, interview questions, and a `basis` that says which claims I checked and which are my own judgment.

| Lesson | What the diagram shows | Checked against |
|---|---|---|
| Request path | DNS, connect, request, server, download, with a time budget | MDN how the web works |
| Scaling out and stateless servers | one server, bigger server, many servers, why memory state breaks it | Twelve-Factor processes, Django sessions |
| Load balancing | round robin, least connections, weights, health checks, the balancer as a single point of failure | nginx load balancing docs |
| Caching | cache-aside, hit rate, staleness, eviction, stampede, key design | Django cache framework, Redis eviction |
| Consistent hashing | modulo reshuffle, the ring, add and remove, virtual nodes | Dynamo paper, Redis Cluster spec |
| Message queues | buffer, backlog, workers, acks, duplicates, idempotency, dead letters | RabbitMQ acks, SQS visibility timeout, Celery |
| Rate limiting | token bucket, window seam, 429, shared counters, DRF | RFC 6585, Stripe, DRF, Redis INCR |
| Timeouts, retries, breakers | timeouts, idempotency keys, retry storm, backoff, breaker states | AWS Builders' Library, Fowler |
| Consensus (Raft) | split brain, majority, terms, election, commit, 3 vs 5 nodes | Raft paper and site |
| Design a URL shortener | numbers, API, code generation, cache, 301 vs 302, failure | MDN redirections, Redis INCR |

Every number in these animations is illustrative or an assumption stated on the page, never a measurement. The URL shortener's traffic and storage figures are assumptions you are meant to confirm with an interviewer.

## What I studied, and what I did not copy

You pointed me at an interactive system design course (`designed-to-scale.vercel.app`, by Dilum Sanjaya according to its page metadata) and asked for the same kind of animation. I opened it in a browser and went through all 40 of its lessons: the sidebar and nine sections, the isometric diagram stage, the live metric cards, the step rail, the problem, technique and solution tags, the callouts, the "what changed" list, the "you will learn" checklist, the replay and pause controls and the keyboard shortcuts. Its Practice, Design Lab and Cheatsheets tabs show a "coming soon" message, so there was nothing to study there. I could not find a licence on the site.

So the engine here is my own code, written from what the pages do, and every lesson's wording, numbers, examples and sources are my own and verified separately. No code, text, icons or artwork from that site is used. If you want to credit it publicly, its author is named in its page metadata and the link is above.

| In that course | In Intervio |
|---|---|
| 40 lessons, one diagram each, 9 sections | 99 lessons in 12 tracks, all on the same stage, every scene with a diagram. 76 have a hand-built scene, 23 were generated from older walkthrough data, 19 of those with a diagram in some or all scenes and 4 panel-only (see the table below) |
| Isometric stage, packets on links, load meters, down markers | Same idea, implemented from scratch: cubes, cylinders, crowds, rings, zones, packets, meters |
| HUD of live metrics | HUD with good, warn and bad tones |
| Step rail, problem, technique, solution tags, what changed, you will learn | All present |
| Replay, pause, arrow keys | Present, plus a prediction gate on selected steps |
| Hash-routed steps (`#/lesson/3`) | Not done: a lesson's step is not in the URL |
| Search (`Ctrl K`), theme toggle, course sidebar | Present: search palette, light and dark paper themes, collapsible course tree with progress |
| 23 languages | Not done. English only |
| Practice, Design Lab, cheatsheets (coming soon there) | Not done here either |

Its other 30 topics (for example CDNs, indexes, storage engines, CAP, pub/sub, real-time updates, microservices, sagas, encryption, and the news feed and chat designs) are not copied as new lessons here; some are covered by existing Intervio lessons in other forms and some are not covered.

## What is verified and what is not

Verified by reading the primary source while writing (each is in `sources.json` marked `read`): Django cache and sessions docs, Redis eviction, INCR and cluster docs, nginx load balancing, Twelve-Factor processes, RabbitMQ acknowledgements, SQS visibility timeout, Celery tasks, DRF throttling, RFC 6585, Stripe's rate limiter post, the AWS Builders' Library retries article, Martin Fowler's circuit breaker page, the Raft paper and site, the Dynamo paper, MDN (how the web works, redirections). I read the two PDFs by extracting their text locally, since the fetch tool cannot read PDFs.

Not verified, and labelled so inside each lesson's `basis`: how many round trips TCP and TLS setup need (the Cloudflare page I tried returned 403), layer 4 versus layer 7 details, the advice to delete rather than overwrite cache keys, jitter formulas, stampede defences, the django-storages settings, the 301 versus 302 recommendation (design judgment), and every priority, hour estimate and illustrative figure. Automated tests check structure and consistency; they cannot judge whether a lesson teaches well.

## Interview standards by role: what I checked, and how the roadmap uses it

You asked for the industry standard for SDE, backend, frontend and AI roles, with data structures and algorithms (DSA), low-level design (LLD), high-level design (HLD), caching and load balancing first, and databases not taking all the weight. This is what I found, with how sure I am. The company pages publish rounds and topics. **None of them publishes hours, weights or pass rates**, so every number below that is a share of study time is my judgment, derived from the shape of the loop.

| Role | What the sources say the loop contains | How sure |
|---|---|---|
| SDE at Amazon | SDE II: an online assessment with 90 min for two coding questions, 20 min of system design scenarios and an 8-min work-style survey; then four 55-min interviews. SDE III: five 55-min interviews and a 60-min phone screen, half on Leadership Principles. Every interviewer asks 2 or 3 behavioral questions; at least one system design question; code must be real, not pseudocode. Topic list: programming language, data structures, algorithms, coding, object-oriented design, databases, distributed computing, operating systems, internet topics, general ML and AI. | Official Amazon pages, opened and read |
| SDE at Meta | Screen of about 35 min with two coding problems (algorithms, data structures, recursion, binary trees); then coding, a 45-min systems or product design round that almost never involves code, and a 45-min behavioral round. | Official blog post, opened and read, but it is older, so the format may have changed. A search summary says some interviews now include an AI assistant: not opened, unconfirmed |
| SDE at Microsoft | Common structures (arrays, strings, graphs and others), know at least one n log n sort, explain complexity, test your own code, design a system from scratch. | Official page, opened and read |
| SDE at Google | Mostly DSA (graphs, trees and dynamic programming come up often); system design stronger at senior levels; a behavioral round. | Search summaries of candidate reports only. Google's own page I fetched had no content |
| Frontend | Five round types: JavaScript coding, UI coding, algorithmic coding, quiz, system design. Amazon, Google and Microsoft ask all five; some companies skip algorithms. Amazon names data structures and algorithms as a core focus. | Handbook (community) and Amazon page, both read |
| ML / AI engineer | Onsites of 4 to 8 interviews: coding, ML theory, ML implementation, behavioral; almost every company asks an ML system design question. A 2026 article claims 'design an LLM-based system' is now the usual design prompt. | Chip Huyen's book read; the LLM claim is one author's opinion with no data |
| Backend (Django) | Job posts and prep guides weight the framework, databases, APIs and deployment more than algorithms; big-company SDE loops still apply if you target them. | Prep guides, mixed snippet and read |

What follows, and what I built for it:

- **Coding on DSA is in every big-company loop, design is in most, behavioral is in all of them. Databases are one topic in a list, not a round.** The platform had 21 database lessons (110 h) against two DSA lessons and no low-level design lesson, so no scheduling change could fix an SDE plan. I added two tracks: **Data structures and algorithms** (11 lessons: arrays and hash maps, stacks and queues, linked lists, sorting and searching, trees, graphs, heaps, recursion and backtracking, dynamic programming, plus the existing Big-O and patterns lessons) and **Low-level design** (5 lessons: SOLID, design patterns, a parking-lot design with the method, an LRU cache, a state machine). The behavioral track gained two lessons, one on how loops are structured by role and one on how to run a coding round, and the STAR lesson went from 3 to 5 hours.
- **Every Python sample in those lessons is executed by the test suite**, with its own asserts (for example, two-sum, merge sort, graph traversal, an LRU cache, a parking lot with a thread lock). The library facts they rely on (heapq, deque, OrderedDict, functools, graphlib, bisect, the sorting HOWTO) are from the Python docs pages I read; the design-pattern and SOLID statements are from refactoring.guru and Wikipedia pages I read.
- **The roadmap now weighs lessons per role** (`PRIORITY_OVERRIDES`, `TRACKS_FOR_DOMAIN`, `DB_SHARE_CAP_FOR` in `backend/learn/roadmap.py`). Measured for a learner with 1.5 years of experience at 2 hours a day, 6 days a week:

| Plan (role, weeks) | DSA | System design | Low-level design | Database | Behavioral | Python/Django |
|---|---|---|---|---|---|---|
| SDE, 9 weeks | 44% | 27% | 12% | 11% | 6% | |
| SDE, 10 weeks | 43% | 26% | 11% | 13% | 5% | |
| SDE, 12 weeks | 40% | 26% | 13% | 13% | 7% | |
| Django backend, 10 weeks | 15% | 4% | 4% | 49% | 2% | 21% |

The SDE database share is capped at about 15% of a cut plan; a backend role keeps more (about 40%), because the job posts for those roles weigh it more. **These shares are my judgment, not a standard.** Plans shorter than about 9 weeks at 2 hours a day cannot fit the core lessons for an SDE role (about 8 for the others) and say so.

**Gaps found in the earlier reviews, and what happened to them.** Closed: frontend interview rounds (JavaScript utilities, UI coding with the W3C ARIA patterns, frontend system design, CSS layout and responsive design, React state), ML (designing an LLM application, generalization and regularization, metrics and A/B testing, a recommender system), operating systems and concurrency, the DSA problem bank, an animated diagram on every scene, the lesson step in the URL, and Meta's current AI-assistant interview note (its hiring page was readable on a later try, so that source is now marked as read). Still open: the Google interview loop rests on candidate-reported summaries because Google's own pages returned nothing useful; the ML track still has no deep learning or NLP lesson; the problem bank covers data structures and algorithms only (no SQL or design problems with a grader); plans shorter than about 9 weeks at 2 hours a day cannot fit the core lessons for an SDE role, which is arithmetic and not something content can fix.

## System design: the standard syllabus, and what each lesson rests on

You asked that the platform follow the industry standard and include system design properly. The system design track now has 26 lessons in a fixed learning order: the answer framework, estimation, the building blocks, then the classic designs. It follows the **System Design Primer's** topic list (read in full from its README) and the prompts that recur in the large-company prep guides (Alex Xu's two volumes, known from search-summary tables of contents only, so labelled as such), and every design is anchored to a primary source where one exists.

| Primer topic or classic prompt | Lesson | Primary source (read) |
|---|---|---|
| How to approach the round | `sd-interview-framework` | Hello Interview's delivery framework (six steps with time budgets), the Primer's four steps |
| Back-of-the-envelope, latency numbers, powers of two | `back-of-envelope-estimation` | Primer tables and its Twitter solution's numbers |
| Performance, scalability, latency, throughput, availability in numbers | `latency-throughput-availability` | Primer; Google SRE book |
| CAP, consistency patterns, fail-over, quorums | `cap-consistency-patterns` | Primer; Dynamo paper |
| DNS, CDN (push and pull), reverse proxy | `dns-cdn-reverse-proxy` | MDN CDN and DNS glossary; Primer |
| Microservices, service discovery, REST, RPC, TCP, UDP, back pressure | `microservices-communication` | Martin Fowler's article; gRPC introduction; Primer |
| Load balancer, cache, queues, consistent hashing, rate limiter, retries, consensus | the 10 lessons that were already in the track | nginx, Django cache, Redis, RabbitMQ, SQS, Stripe, AWS, Raft and Dynamo sources |
| Pastebin / URL shortener | `design-url-shortener` | existing |
| Twitter timeline / news feed | `design-news-feed` | Primer's Twitter solution (users, tweets per day, fan-out, celebrity hybrid) |
| Chat system | `design-chat-system` | Discord's engineering post; MDN WebSockets; Firebase FCM overview |
| Notification system | `design-notification-system` | FCM overview; AWS retries; SQS visibility timeout; Stripe idempotency |
| Web crawler | `design-web-crawler` | Primer's crawler solution; RFC 9309 (robots.txt) |
| Key-value store | `design-key-value-store` | Dynamo paper; Primer's query-cache solution |
| Search autocomplete | `design-autocomplete` | no primary source found: my own synthesis of the trie, cache and offline pipeline ideas, and labelled so |
| File storage (Dropbox, Drive) | `design-file-storage` | Dropbox's streaming file synchronization post |
| Video streaming (YouTube) | `design-video-streaming` | MDN's adaptive streaming page |
| Proximity service (Uber, nearby) | `design-proximity-service` | Uber's H3 post |
| Payment system | `design-payment-system` | Stripe's idempotency post; the ledger and reconciliation parts are standard practice, stated as such |

Each of these lessons has a stepped diagram with predict questions, a full written lesson, interview questions, and runnable Python that the test suite executes with its own asserts (for example a fan-out feed with a celebrity pull path, a Dynamo-style store with hinted handoff, a block-level sync protocol, a payment with an idempotency key and a ledger that always sums to zero). A test (`SystemDesignCurriculumTests`) fails if a Primer topic or a classic prompt loses its lesson, if the track stops starting with the framework, or if the SDE plan gives system design less than about a fifth of the time.

**What I could not verify.** Alex Xu's chapter list beyond the titles in search summaries; Google's and Meta's current design rounds (official pages were thin or blocked); any production detail of autocomplete; Cloudflare's CDN and DNS pages (403), so the DNS caching and TTL statements are general knowledge rather than quoted; the Primer's treatment of crawler politeness (thin), so the per-host queue is my own design. Numbers quoted from a page (Primer, Discord, Dropbox, Uber) say whose figures they are; the Discord and Dropbox results are those companies' own claims. Every figure inside an animation or an exercise is an illustrative assumption.

**No deadline.** Weeks can be set to 0 ("No deadline" in the profile form). Then nothing is cut: every lesson for the role is kept, the days are laid out to fit them at your hours per day and days per week, and the plan reports how many weeks that takes (about 9 weeks for a full SDE plan at 2 h a day). Raise hours or days to finish sooner. With a deadline the old behaviour is unchanged: lessons are cut by priority and the plan lists what was cut.

**Weights.** In an SDE plan, system design is now about a quarter of the time (measured at 9 to 12 weeks, 2 h a day, 6 days a week, 1.5 years of experience: data structures and algorithms 40 to 44%, system design 26 to 27%, low-level design 11 to 13%, database 11 to 13%, behavioral 5 to 7%). With design lessons core, a full SDE plan now needs about 9 weeks at 2 hours a day; shorter plans cut and say so. These shares are my judgment from the shape of the loops, not a published standard.

## The look: soft, rounded, and yours to choose

The interface is built to feel calm for long study sessions. Shapes are rounded (pill buttons and tabs, round icon buttons, large corner radii), shadows are soft, and borders are thin and light. The page has a gentle background: a soft colour glow in the corners and a faint dot pattern, tinted by the chosen palette.

**Appearance button (top bar).** Each learner picks what they like to study with, and the choice is remembered in the browser:

- **Colour:** Ocean (calm blue, the default), Sage (soft green), Lavender (gentle violet) and Paper (warm, easy on the eyes). Each has a light and a dark version, and the dark/light toggle works with all of them.
- **Font:** Plus Jakarta Sans (the default), Atkinson Hyperlegible (designed to be easy to read), Source Serif (book-style text for the long reading, with the rest of the interface staying in a sans font) and DM Sans. Only code uses a monospace font (JetBrains Mono). Fonts come from Google Fonts, with system fonts as the fallback.

**Logo.** An isometric cube in the chosen colours, the same shape the lesson diagrams are built from, next to a plain "Intervio" wordmark. It follows the palette, and the browser tab icon matches the default.

The colours live as tokens at the top of `styles.css` and in the "Colour palettes and fonts" block at the end; the "Soft theme" block holds the shape overrides. The isometric diagrams keep their cube shapes on purpose; their labels use the chosen font.

## A lesson is a short course, one screen at a time

A lesson used to be one long page (about 8 screens). It is now a short course with one thing on each screen, in the order a beginner needs it: **Picture it** (the everyday story and the hard words), **Watch it** (the animation), **Read** (the explanation and "remember this"), **Code** (only for lessons that have code), **Practice**, **Check yourself** (interview questions) and **Finish** (sources, why this priority, mark complete, next lesson).

- A progress bar at the top shows "Step 3 of 7" and lets you jump to any step.
- A Back and Continue bar is pinned to the bottom of the screen, so you never scroll to move on.
- The step is in the address (`/concept/acid?s=read`), so a link opens at that step and a reload keeps your place. The animation keeps its own step in the `#scene=..&step=..` part.
- Body text uses a normal reading font at a comfortable size and line length. Only code stays monospace. Colours are quieter: plain cards instead of green boxes.

## In everyday life: a plain-words opener on every lesson

Every one of the 99 lessons now starts with a short card, before the animation: one sentence in plain words, a small real-life story (a tea stall for caching, a school roll number for keys, a courier tray for queues), and a table that says what each part of the story stands for in the lesson. The idea is that you can picture the topic before you meet the technical words. The comparisons are my own and are only meant to help you picture the idea; the card says so, and the lesson below it gives the exact version.

It is stored in the `everyday` field of each lesson in `concepts.json` (`plain`, `story`, `maps`). A test (`EverydayExampleTests`) fails if a lesson has no story, a story under 30 words, fewer than two table rows, or any sentence over 40 words. Each card also has a "Words in this lesson" box (3 to 5 hard words per lesson, 379 in all, each explained in one plain sentence), and the one-line summary under every lesson title was rewritten in plain words. A test checks that every explained word really appears in its lesson. The longer technical text of each lesson was not rewritten.

## Animation on every lesson

Every lesson, and every scene inside it, is an isometric step-through diagram (the stage engine described above). A test (`EveryLessonIsAnimatedTests`) fails the build if any scene has fewer than three nodes or if the diagram does not change on at least half of its steps, so the rule cannot erode. Abstract topics are animated with the same tools: array cells that dim as binary search discards them, hash tables that fill as a set is built, call frames that stack and unwind, a recursion tree that prunes, a memo table that stops repeated calls, a commit graph that merges and rebases, query rows that collapse under GROUP BY and stay under a window function, a training and test split that exposes overfitting.

**Motion and what it depends on.** Packets are SVG animations; the rest is CSS. If the operating system asks for reduced motion (Windows "Show animations in Windows" off, or the browser setting), the page honours it: packets stand still and transitions are off, and a note above the diagram offers "Play animations anyway" (remembered in this browser). I checked in Edge that with the setting off the packets do not move and that the button turns them on and survives a reload.

**Life in the diagram.** Servers and CPUs have blinking status lights, queues a moving conveyor, clouds puffs, gears turn, every solid object floats slightly and casts a shadow, the nodes a step uses get a dashed ring, and the roads its packets travel glow in the packet colour with moving dashes. The data-structure lessons use their own shapes: array and linked-list items are flat cells with the value on top, stack and queue items are plates, and tree, graph, heap and recursion-tree nodes are balls (set with `icon: "cell"`, `"plate"` or `"ball"` on a cube node). Everything else is still one visual vocabulary (cubes, cylinders, devices, crowds), and the 23 lessons converted automatically from the older format remain plainer than the hand-built ones.

| How the scene was made | Lessons |
|---|---|
| Hand-built for the lesson, with its own layout and per-step patches | 76 of the 99 lessons |
| Generated from the older walkthrough data by a script (boxes in a flow become cubes, state becomes colour, glow and dimming, chips become the metrics row, tables and code become cards) | 23 lessons: plainer than the hand-built ones, but animated and tested to the same rule |
| Lessons that keep an older interactive widget, as a collapsible "Try it yourself" lab under the diagram | the database lessons (er, keys, normalization, denormalization, constraints, indexing and others) |

Earlier I called some lessons "not component diagrams" and left them as a text panel (tables, algorithms, ER, query plans, Git, Big-O, behavioral answers). That was the wrong call: 14 lessons had no picture at all and 15 more had scenes without one. They now do, with 40 new diagrams added to the existing steps without touching their text.

## Problem bank (practice DSA in the page)

`/problems` has 39 practice problems for the data structures and algorithms track (arrays and hashing, stacks, linked lists, sorting and searching, trees, graphs, heaps, backtracking, dynamic programming, two pointers and sliding window), with easy, medium and hard grades. You write Python in the page, press Run, and see each test pass or fail. Each lesson links to its problems.

- **How it runs.** Python executes in your browser with Pyodide (CPython compiled to WebAssembly) in a Web Worker, so nothing you type is sent to the server and an infinite loop can only freeze the worker. There is no time limit: a run goes on until it finishes, the button shows the seconds elapsed and turns into Stop, and Stop terminates the worker (a fresh one starts on the next run). Pyodide is downloaded from the jsDelivr CDN the first time (about 10 MB, then cached); version 0.27.7 is pinned because the newest version quoted in Pyodide's docs (v314.0.8) failed to load in a worker in my tests. If the CDN is unreachable the page says so.
- **The statements are original.** They describe classic interview problems in my own words, with my own tests; none is copied from a judge.
- **Speed tests are part of the tests.** Many problems include a 100,000-item case that an O(n^2) solution is far too slow for, so the grader teaches complexity as well as correctness (a brute-force Two Sum is visibly slow on it, and you can press Stop).
- **Every problem is verified.** The test suite runs each reference solution against its own cases in an isolated subprocess (all must pass), and runs the empty starter (it must fail), so a case that proves nothing cannot slip in.
- **Limits.** It is not a general judge: no other languages, no hidden tests, no leaderboard. The tests are visible on purpose. Solved marks and drafts are kept in your browser's local storage on this device.

The step of a lesson is now in the URL (`#scene=2&step=5`), so a step can be linked to and a reload keeps your place.
