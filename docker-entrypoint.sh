#!/bin/sh
# ACA TicketOps - Docker Entrypoint Script
# Handles database migrations, seeding, and application startup

set -e

echo "🚀 Starting ACA TicketOps..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
until pg_isready -h "${DATABASE_HOST:-localhost}" -p "${DATABASE_PORT:-5432}" -U "${DATABASE_USER:-postgres}" > /dev/null 2>&1; do
  echo "Database not ready, waiting..."
  sleep 2
done

echo "✅ Database is ready"

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

# Check if seeding is needed (first run)
if [ "${SEED_DATABASE:-false}" = "true" ]; then
  echo "🌱 Seeding database with initial data..."
  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
fi

# Start the application
echo "🎯 Starting application server..."
exec "$@"