#!/bin/sh
set -e

# Migrations in this repo are incremental ALTERs only (no baseline CREATE).
# Fresh VPS DBs have no tables, so `migrate deploy` fails on ALTER TABLE Document.
# Production bootstrap: sync full schema, then mark migration history as applied.

echo "Syncing database schema (prisma db push)..."
npx prisma db push --skip-generate

echo "Baselining migration history..."
for dir in prisma/migrations/*/; do
  name=$(basename "$dir")
  case "$name" in
    *[0-9]*)
      npx prisma migrate resolve --applied "$name" 2>/dev/null || true
      ;;
  esac
done

echo "Starting AuditIQ server..."
exec node dist/index.js
