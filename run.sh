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
  seed-prod           load/refresh learning content into the prod database (start-prod does this too)
  interactive-prod    open a Django python shell in the prod containers
  stop-prod           stop the prod stack (data kept; add --volumes to wipe the DB)
  deploy-frontend     build the frontend (in Docker) and copy it to /var/www/intervio (server)
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
    echo "Prod stack running. Logs: docker compose -p intervio-prod logs -f"
    # The API is already serving; refresh content afterwards so a slow or failed seed never takes it down.
    echo "Seeding content (the API stays up meanwhile)..."
    "${PROD[@]}" run --rm backend python manage.py seed_content \
      || echo "WARNING: seeding failed; the API is up with the previous content. Retry: bash run.sh seed-prod" >&2
    ;;
  seed-prod)
    need_env
    "${PROD[@]}" run --rm backend python manage.py seed_content
    ;;
  interactive-prod)
    need_env
    "${PROD[@]}" run --rm --build backend python manage.py shell "$@"
    ;;
  stop-prod)
    need_env
    "${PROD[@]}" down "$@"
    ;;
  deploy-frontend)
    # Builds with Node in a throwaway container, so Node is not needed on the server.
    API_URL="${VITE_API_URL:-https://api.intervio.co.in}"
    docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e VITE_API_URL="$API_URL" \
      -v "$PWD/frontend":/app -w /app node:22-slim \
      sh -c "npm install --no-package-lock --no-audit --no-fund && npm run build"
    sudo mkdir -p /var/www/intervio
    sudo rm -rf /var/www/intervio/*
    sudo cp -r frontend/dist/. /var/www/intervio/
    echo "Frontend deployed to /var/www/intervio (API: $API_URL)"
    ;;
  migrations)
    "${DEV[@]}" run --rm --build backend sh -c "python manage.py makemigrations && python manage.py migrate" "$@"
    ;;
  *)
    usage
    [ -z "$cmd" ] || exit 1
    ;;
esac
