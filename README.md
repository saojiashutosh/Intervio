# Intervio

An interview-prep portal for software engineers. It teaches 220 lessons in 12 tracks as short, step-by-step courses with animated diagrams, and adds a personal study roadmap, a coding problem bank, SQL drills and spaced-repetition flashcards.

## What it does

| Track | Lessons |
|---|---|
| Database engineering (with the Django ORM angle) | 21 |
| Python and Django core | 13 |
| Behavioral and interview skills | 4 |
| Data structures and algorithms | 100 |
| Low-level design (object-oriented) | 9 |
| Computer science fundamentals | 4 |
| Scaling and distributed systems (system design) | 39 |
| Git, containers and deployment | 4 |
| Frontend engineering | 9 |
| Data engineering | 6 |
| DevOps and reliability | 3 |
| Machine learning engineering | 8 |

- **A lesson is a short course, one screen at a time:** Picture it (a plain-words story and the hard words), Watch it (the animation), Read, Code (only if the lesson has code), Practice, Check yourself (interview questions) and Finish (sources, mark complete, next lesson). The step is in the URL (`/concept/acid?s=read`), so links and reloads keep your place.
- **Animated diagrams:** every lesson has isometric step-through diagrams with live metrics, packets travelling along links, and prediction questions on selected steps. Keyboard: click the diagram, then `←` `→` to step, `R` to replay, `Space` to pause. Reduced-motion settings are respected.
- **Personal roadmap** (`/my-plan`): enter your background, goal, experience, weeks, hours per day and days per week, and get a day-by-day schedule that says what it cut and why.
- **Problem bank** (`/problems`): 60 data structures and algorithms problems (easy, medium, hard). You write Python in the page and run the tests. Code runs in your browser (Pyodide in a Web Worker), so nothing you type is sent to the server. Solved marks and drafts stay in your browser.
- **Practice** (`/practice`): SQL drills and exercises. Signed-in learners also get flashcards with Leitner spaced repetition. Also: a 12-week plan, interview questions, projects, and a sources page listing what each lesson rests on.
- **Comfortable to study with:** a search palette (`Ctrl K`), light and dark themes, an Appearance menu (four colour palettes, four fonts), and a layout that works on phones.
- **Works without an account:** progress is saved in the browser; signing in syncs it to the server.

## Tech stack

- **Backend:** Django 5.2 + Django REST Framework (`backend/`). PostgreSQL in Docker and production; SQLite as a zero-setup fallback when you run without Docker.
- **Frontend:** React + TypeScript + Vite + Framer Motion (`frontend/`).
- **Content:** JSON in `backend/content/` is the source of truth. `manage.py seed_content` loads it into the database.

## Quick start (Docker, no accounts needed)

You need Docker. Nothing else.

```bash
bash run.sh start-dev     # Django on http://localhost:8000 with its own Postgres container
bash run.sh stop-dev      # add --volumes to wipe the local database
```

This uses `docker-compose.dev.yml`, which starts a throwaway `postgres:16-alpine` container, so you never need a hosted database or a `DATABASE_URL`. It runs migrations and loads the lessons for you. Then start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173 (proxies /api to Django)
```

Other helpers: `bash run.sh migrations` (makemigrations + migrate in the dev containers) and `bash run.sh interactive-dev` (Django shell). Run `bash run.sh` with no argument to list every command.

`docker-compose.yml` and `backend/.env.example` are for the production server only. Do not use them for local work.

## Run it without Docker (Windows)

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
npm run dev                               # http://localhost:5173
```

To use PostgreSQL instead of SQLite here, set `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` and `POSTGRES_PORT` before `migrate` / `runserver`.

## Tests

- Backend: `cd backend; .venv\Scripts\python manage.py test`
- Frontend type-check and build: `cd frontend; npm run build`
- Frontend render and interaction tests of every page and animation: `cd frontend; npm test` (needs the Django server running; on Windows run it from PowerShell, because Git Bash picks a different Node)

The backend tests also validate the content: every lesson has an animation, sources, an everyday story and explained words; every stage scene is well formed; every Python sample in the lessons runs; every problem's reference solution passes its own cases and its empty starter fails.

## Contributing

Anyone can propose a change. Only the maintainer merges.

1. Fork the repo and create a branch.
2. Make your change and run the tests.
3. Open a pull request **into `dev`** (not `main`). `main` and `dev` are protected: no direct pushes, and every pull request needs an approval.

Full steps and the checklist are in [CONTRIBUTING.md](CONTRIBUTING.md). Report security problems privately, as described in [SECURITY.md](SECURITY.md).

## Deploy

Production is two parts: the backend in Docker (gunicorn on `127.0.0.1:8000`) and the built frontend served by nginx on the host. The database is hosted PostgreSQL, set by `DATABASE_URL`.

```bash
cp backend/.env.example backend/.env   # fill in the values; never commit this file
bash run.sh start-prod                 # backend (docker-compose.yml)
bash run.sh deploy-frontend            # builds the app and copies it to /var/www/intervio
```

`backend/.env` needs `DATABASE_URL`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` and `CORS_ALLOWED_ORIGINS`. The compose file sets `DJANGO_DEBUG=0` itself. The frontend reads its API address from `VITE_API_URL` at build time (default `https://api.intervio.co.in`); never put secrets in a `VITE_` variable, because it ends up in the public JavaScript. The nginx config and one-time server setup are in `deploy/nginx/intervio.conf.template`.

## Project layout

```
backend/
  config/        Django settings and URLs
  learn/         models, API views, roadmap scheduler, tests
  content/       JSON content: concepts, levels, tracks, plan, drills, exercises, problems, sources
frontend/src/
  pages/         one file per route (Home, Concept, MyPlan, Problems, Practice, ...)
  viz/           animation engine (StageViz, stage shapes, inline visuals)
  components/    app shell, search palette, appearance menu
deploy/nginx/    nginx template for the production server
run.sh           dev and prod helper commands
```

## Edit or add content

Edit the JSON in `backend/content/` (or use `/admin`), then run `manage.py seed_content`. It is safe to repeat, and user progress is kept.

`tracks.json` defines the tracks. Each level in `levels.json` belongs to one track (`"track": "python-django"`), and each concept in `concepts.json` belongs to a level. To add a lesson, append an entry to `concepts.json` with a level from the track you want, plus:

- **`everyday`**: a plain-words opener (`plain`, `story`, `maps`) and 3 to 5 hard words with one-sentence meanings. Tests require a story of at least 30 words, at least two map rows, no sentence over 40 words, and that each explained word appears in the lesson.
- **`explain`**: a list of strings, at least 350 words in total. A string starting with `## ` is a subheading, `> ` is a worked example, lines starting `- ` form a bullet list, and `@viz:<id>` embeds a small interactive visual at that point (ids are in `frontend/src/viz/inline/index.tsx`).
- **`viz`**: the animation. Use `"viz": "stage"` with a `scenes` list (format below), or a built-in id from `frontend/src/viz/index.tsx`. A test fails if a lesson has no animation.
- **`basis` and `sources`**: what the lesson rests on, as keys from `sources.json`. Sources are labelled `read` (read in full) or `snippet` (search summary only). Only add reference links you have opened.
- Optional: `sql`/`django` code samples (an empty one hides the section; `lang` can be `py` or `sh`), interview questions, and exercises.

### Stage scene format

A stage diagram is data, with no React code. It has nodes on an isometric floor, links between them, and a list of steps. Each step carries the explanation and a `set` patch that changes the picture, so the diagram morphs from one step to the next.

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

- **Node kinds:** `cube` (a service), `db` (cylinder), `crowd`, `device` (`laptop` or `phone`), `dot` (a key or token), `zone` (a dashed region), `ring`. Data-structure lessons also use `icon: "cell"`, `"plate"` or `"ball"` on a cube. Tones: blue, orange, purple, green, yellow, grey, red, teal. About 30 icons are built in (`viz/stage/icons.tsx`).
- **Patches:** `from` and `until` show a node or link only on some steps. A `set` patch merges forward: `x` and `y` move a node, `pill` floats a label above it, `load` shows a 0 to 100 meter, `status` is `ok`, `down`, `hot` or `dim`, `hidden` removes it, `label` and `tone` change it. A step that omits `hud` keeps the previous metrics.
- **Flows** send packets along a path of node ids. The kind must appear in the scene's `legend` (request, response, query, write, event, sync, token, fail and heartbeat have colours).
- **Accessibility:** a hidden text list gives every visible node and its status, the metrics row is announced, and the step list is a navigation landmark. On phones the diagram scrolls sideways, because its text would be too small if shrunk to fit.
- **Tests** validate every scene: known node kinds and tones, links and patches pointing at real nodes, flows using a legended kind, prediction answers in range, at least three nodes, and the diagram changing on at least half the steps.

## Roadmap rules

The roadmap (`backend/learn/roadmap.py`) turns a profile into a day-by-day plan.

- **Background decides the tracks.** The profile background (`django`, `backend`, `student`, `sde`, `fullstack`, `frontend`, `data`, `devops`, `ml`) picks which tracks are scheduled (`TRACKS_FOR_DOMAIN`), so a frontend learner gets frontend, data structures and algorithms, behavioral and delivery lessons and no database or Django capstone. Each role also re-weights lessons (`PRIORITY_OVERRIDES`).
- **Priorities and cuts.** Every lesson has a priority. When the weeks are too few, optional lessons are cut in proportion to each track's size, and core (priority 1) lessons are never cut. The plan lists every cut in its notes.
- **Tracks are mixed, not stacked.** After the cuts, lessons are interleaved across tracks by taking the next lesson from the track that is furthest behind. The first lesson of every track is kept until everything else is cut, and the capstone and mock interviews stay at the end.
- **Database share cap.** A cut plan cannot give the database track more than a set share of its minutes (`DB_SHARE_CAP`, `DB_SHARE_CAP_FOR` per role). The cap and the priorities are editorial choices, not published standards.
- **No deadline.** Set weeks to 0 and nothing is cut: the days are laid out to fit every lesson at your hours per day and days per week, and the plan reports how many weeks that takes.
- **Too little time.** If the weeks are too few to fit the core lessons for the role, the plan says so.

## API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/content/` | public | all levels, concepts, plan, exercises, drills, questions |
| `POST /api/auth/register/`, `/login/` | public (throttled) | returns a token |
| `POST /api/roadmap/` | public (throttled) | profile in, day-by-day schedule + cuts + reading list out |
| `GET /api/profile/`, `PUT /api/profile/` | token | saved profile (background, goal, experience, weeks, hours/day, days/week, start date) |
| `GET /api/progress/`, `POST /api/progress/toggle/` | token | completion keys like `concept:acid`, `plan:3:2` |
| `GET /api/flashcards/`, `POST /api/flashcards/<id>/review/` | token | Leitner spaced repetition |

## Look and feel

Shapes are rounded, shadows are soft, and the page has a gentle background. The Appearance button in the top bar lets each learner pick a colour (Ocean, Sage, Lavender or Paper, each with a light and a dark version) and a font (Plus Jakarta Sans, Atkinson Hyperlegible, Source Serif or DM Sans); only code uses a monospace font (JetBrains Mono). The choice is remembered in the browser. Fonts come from Google Fonts, with system fonts as the fallback. The colours live as tokens at the top of `frontend/src/styles.css`, and the logo is an isometric cube in the chosen colours.

## License

[MIT](LICENSE)
