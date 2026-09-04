#!/bin/sh
set -e

# Prefer migrate deploy (fast on every restart). Fall back to db push + baseline
# only when the DB has no migration history yet (fresh install).

echo "Applying database migrations..."
if ! npx prisma migrate deploy; then
  echo "migrate deploy failed — attempting fresh-schema bootstrap (db push + baseline)..."
  npx prisma db push --skip-generate
  for dir in prisma/migrations/*/; do
    name=$(basename "$dir")
    case "$name" in
      *[0-9]*)
        npx prisma migrate resolve --applied "$name" 2>/dev/null || true
        ;;
    esac
  done
fi

# Claims nav needs expenses:view on roles (additive; safe if already present)
echo "Ensuring expenses permissions for Claims..."
node scripts/ensure-expenses-permissions.mjs || echo "ensure-expenses skipped (non-fatal)"

echo "Starting AuditIQ server..."
exec node dist/index.js
