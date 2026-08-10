#!/usr/bin/env bash
# ============================================================
# AuditIQ India — MySQL Restore Script
# Usage:
#   ./scripts/restore.sh <backup_file.sql.gz>              # Docker mode
#   ./scripts/restore.sh <backup_file.sql.gz> --local      # Local MySQL
#
# WARNING: This will DROP and recreate the database!
# ============================================================

set -euo pipefail

# ---------- arguments ----------
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup_file.sql.gz> [--local]"
  echo ""
  echo "Available backups:"
  ls -lh ./backups/*.sql.gz 2>/dev/null || echo "  (none found in ./backups/)"
  exit 1
fi

BACKUP_FILE="$1"
MODE="docker"

if [[ "${2:-}" == "--local" ]]; then
  MODE="local"
fi

DB_NAME="${MYSQL_DATABASE:-auditiq}"

# ---------- validation ----------
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

if [[ ! "$BACKUP_FILE" == *.sql.gz ]]; then
  echo "ERROR: Expected a .sql.gz file, got: ${BACKUP_FILE}"
  exit 1
fi

FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "============================================="
echo " AuditIQ Restore — $(date)"
echo " Mode:     ${MODE}"
echo " Database: ${DB_NAME}"
echo " File:     ${BACKUP_FILE} (${FILESIZE})"
echo "============================================="
echo ""
echo "⚠️  WARNING: This will DROP the '${DB_NAME}' database and restore from backup."
read -rp "Type 'yes' to continue: " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
  echo "Restore cancelled."
  exit 0
fi

# ---------- restore ----------
echo "Restoring database..."

if [[ "$MODE" == "docker" ]]; then
  if [[ -z "${MYSQL_ROOT_PASSWORD:-}" ]] && [[ -f .env ]]; then
    # shellcheck disable=SC1091
    source .env 2>/dev/null || true
  fi
  MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-auditiq_secret}"

  docker compose exec -T db mysql \
    --user=root \
    --password="$MYSQL_ROOT_PASSWORD" \
    -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`; CREATE DATABASE \`${DB_NAME}\`;"

  gunzip -c "$BACKUP_FILE" | docker compose exec -T db mysql \
    --user=root \
    --password="$MYSQL_ROOT_PASSWORD" \
    "$DB_NAME"
else
  MYSQL_HOST="${MYSQL_HOST:-localhost}"
  MYSQL_PORT="${MYSQL_PORT:-3306}"
  MYSQL_USER="${MYSQL_USER:-root}"

  mysql \
    --host="$MYSQL_HOST" \
    --port="$MYSQL_PORT" \
    --user="$MYSQL_USER" \
    ${MYSQL_ROOT_PASSWORD:+--password="$MYSQL_ROOT_PASSWORD"} \
    -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`; CREATE DATABASE \`${DB_NAME}\`;"

  gunzip -c "$BACKUP_FILE" | mysql \
    --host="$MYSQL_HOST" \
    --port="$MYSQL_PORT" \
    --user="$MYSQL_USER" \
    ${MYSQL_ROOT_PASSWORD:+--password="$MYSQL_ROOT_PASSWORD"} \
    "$DB_NAME"
fi

echo "============================================="
echo " Restore complete!"
echo " Database '${DB_NAME}' restored from: $(basename "$BACKUP_FILE")"
echo ""
echo " Next steps:"
echo "   1. Run migrations:  npx prisma migrate deploy"
echo "   2. Verify data:     npx prisma studio"
echo "============================================="
