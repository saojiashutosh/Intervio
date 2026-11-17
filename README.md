# Intervio

Learn database engineering for interviews: 19 concepts (15 core + a Django track), a 12-week plan, SQL drills, interactive animations, and spaced-repetition flashcards. Every concept has a Django ORM section.

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

Tests: `cd backend; .venv\Scripts\python manage.py test` · Type-check + build: `cd frontend; npm run build` · Render test of every page and animation: `cd frontend; npm test` (needs the Django server running)

## Use PostgreSQL instead of SQLite

Set these before `migrate` / `runserver`: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`.
For production also set `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`.

## Edit or add content

Edit the JSON in `backend/content/` (or use `/admin`), then run `manage.py seed_content` (idempotent; user progress is kept). Every concept has an animation. A concept's `viz` field selects it from `frontend/src/viz/` (er, fk, normalize, denorm, types, constraints, sqlnosql, plan, index, atomic, isolation, lock, replication, sharding, cache, nplus1, pagination, oncommit, security). Each follows the same loop: predict, watch, break it. A test fails if a concept has no animation.

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

A concept's `explain` is a list of strings. A string starting with `## ` is a subheading, `> ` is a worked example, lines starting `- ` form a bullet list, and `@viz:<id>` embeds a small interactive visual at that point in the reading (ids in `frontend/src/viz/inline/index.tsx`: er-anatomy, er-notation, er-design, fk-side, joins, decompose, composite-index, mvcc, deadlock, hashring, celery-flow, wal, cache-aside). Tests fail if a marker names an unknown visual, or if a lesson is under 350 words.
