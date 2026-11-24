#!/bin/sh
set -eu

# The app image contains only the standalone Next.js runtime. Apply reviewed
# migrations separately with the compose `migrate` service, never with db push.
if [ "${RUN_MIGRATIONS:-false}" = "true" ] || [ "${SEED_DATABASE:-false}" = "true" ]; then
  printf '%s\n' 'Refusing implicit migration or demo seeding in the app container.' >&2
  printf '%s\n' 'Apply reviewed migrations with the migrate service; seed only through an explicitly approved development workflow.' >&2
  exit 1
fi

if [ -z "${JWT_SECRET:-}" ] || [ "${#JWT_SECRET}" -lt 32 ]; then
  printf '%s\n' 'JWT_SECRET must be provided at runtime and contain at least 32 characters.' >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  printf '%s\n' 'DATABASE_URL must be provided at runtime.' >&2
  exit 1
fi

if [ "${ALLOW_EPHEMERAL_DEV_AUTH:-false}" = "true" ]; then
  printf '%s\n' 'ALLOW_EPHEMERAL_DEV_AUTH is not supported in this production-mode image.' >&2
  exit 1
fi

exec "$@"
