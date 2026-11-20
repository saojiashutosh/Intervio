#!/usr/bin/env bash
# Usage: bash run.sh <command>
set -euo pipefail
cd "$(dirname "$0")"

DEV=(docker compose -p intervio-dev  -f docker-compose.dev.yml)
PROD=(docker compose -p intervio-prod -f docker-compose.yml)

need_env() {
  if [ ! -f backend/.env ]; then
    echo "Missing backend/.env. Run: cp backend/.env.example backend/.env  (then edit the values)" >&2
    exit 1
  fi
}

usage() {
  cat <<USAGE
Usage: bash run.sh <command>

  start-dev           build and start the dev stack (runserver, hot reload) on :8000
  interactive-dev     open a Django python shell in the dev containers
  stop-dev            stop the dev stack (data kept; add --volumes to wipe the DB)
  start-prod          build and start the prod stack (gunicorn) in the background
  interactive-prod    open a Django python shell in the prod containers
  stop-prod           stop the prod stack (data kept; add --volumes to wipe the DB)
  migrations          dev: makemigrations + migrate (new files land in backend/)
USAGE
}

cmd="${1:-}"; shift || true

case "$cmd" in
  start-dev)
    "${DEV[@]}" up --build "$@"
    ;;
  interactive-dev)
    "${DEV[@]}" run --rm --build backend python manage.py shell "$@"
    ;;
  stop-dev)
    "${DEV[@]}" down "$@"
    ;;
  start-prod)
    need_env
    "${PROD[@]}" up --build -d "$@"
    echo "Prod stack running. Logs: docker compose -p intervio-prod logs -f
    ;;
  interactive-prod)
    need_env
    "${PROD[@]}" run --rm --build backend python manage.py shell "$@"
    ;;
  stop-prod)
    need_env
    "${PROD[@]}" down "$@"
    ;;
  migrations)
    "${DEV[@]}" run --rm --build backend sh -c "python manage.py makemigrations && python manage.py migrate" "$@"
    ;;
  *)
    usage
    [ -z "$cmd" ] || exit 1
    ;;
esac
