#!/usr/bin/env bash
# ACA TicketOps deployment helper.
#
#   ./deploy.sh check    Validate configuration (no changes)
#   ./deploy.sh build    Build application + migration images
#   ./deploy.sh migrate  Apply reviewed Prisma migrations
#   ./deploy.sh up       Start the application
#   ./deploy.sh seed     Seed initial data (first run only)
#   ./deploy.sh logs     Follow application logs
#
# This script does not provision cloud resources, DNS, or TLS certificates.
# Put a TLS-terminating proxy or load balancer in front of the app.
set -euo pipefail

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
}

require_env() {
  if [ ! -f .env ]; then
    printf '%s\n' 'Create .env from .env.example and set DATABASE_URL, POSTGRES_PASSWORD, and JWT_SECRET.' >&2
    exit 1
  fi
  if ! command -v docker >/dev/null 2>&1; then
    printf '%s\n' 'Docker with the Compose plugin is required.' >&2
    exit 1
  fi
}

action="${1:-check}"
case "$action" in
  check)
    require_env
    docker compose config --quiet
    printf '%s\n' 'Configuration is valid.'
    ;;
  build)
    require_env
    docker compose build app
    docker compose --profile migration build migrate
    printf '%s\n' 'Images built. No containers were started.'
    ;;
  migrate)
    require_env
    docker compose --profile migration run --rm migrate
    printf '%s\n' 'Migrations applied.'
    ;;
  seed)
    require_env
    if [ -z "${ADMIN_INITIAL_PASSWORD:-}" ] && ! grep -q '^ADMIN_INITIAL_PASSWORD=.\+' .env; then
      printf '%s\n' 'Set ADMIN_INITIAL_PASSWORD in .env before the first seed.' >&2
      exit 1
    fi
    docker compose --profile migration run --rm --entrypoint sh migrate -c \
      'node node_modules/ts-node/dist/bin.js --compiler-options "{\"module\":\"CommonJS\"}" prisma/seed.ts'
    printf '%s\n' 'Seed complete. Unset ADMIN_INITIAL_PASSWORD afterwards.'
    ;;
  up)
    require_env
    docker compose up -d
    printf '%s\n' 'Application started. Follow logs with: ./deploy.sh logs'
    ;;
  logs)
    docker compose logs -f app
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    printf 'Unsupported action: %s\n' "$action" >&2
    usage >&2
    exit 2
    ;;
esac
