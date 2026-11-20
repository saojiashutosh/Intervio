# Contributing to Intervio

Thanks for helping. Anyone can propose a change with a pull request. Only the maintainer merges.

## How it works

1. **Fork** this repo on GitHub.
2. Create a branch in your fork, for example `fix/sql-lesson-typo`.
3. Make your change and run the tests (see below).
4. Open a pull request **into `dev`** (not `main`).
5. The maintainer reviews it. `main` and `dev` are protected: nobody can push to them directly, and every pull request needs an approval.

## Run it on your computer (no accounts needed)

You do **not** need our database. The dev setup starts its own Postgres in Docker.

```bash
bash run.sh start-dev        # Django on http://localhost:8000 plus a local Postgres
```

Or without the script:

```bash
docker compose -p intervio-dev -f docker-compose.dev.yml up --build
```

In a second terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

Stop it with `bash run.sh stop-dev` (add `--volumes` to wipe the local database).

**Do not** use `docker-compose.yml` or `backend/.env.example`. They are for the maintainer's production server (a hosted database). If you set `DATABASE_URL` you will not be using the local container.

## Before you open a pull request

- Backend tests: `cd backend && python manage.py test`
- Frontend type-check and build: `cd frontend && npm run build`
- Frontend tests: `cd frontend && npm test` (needs the Django server running)
- Adding or changing a lesson? Read the "Edit or add content" and "Lesson text markup" sections of the README. The tests check word counts, sources and animations.

## Good pull requests

- Small and about one thing.
- A clear title and a short description of what changed and why.
- Tests for new behaviour.
- No secrets, no `.env` files, no `db.sqlite3`.

## Reporting bugs and security problems

- Bugs and ideas: open a GitHub issue.
- Security problems: do not open a public issue. See [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your work is released under the project's [MIT License](LICENSE).
