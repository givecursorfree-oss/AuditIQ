#!/usr/bin/env bash
# ============================================================
# AuditIQ — Full backup (MySQL + document uploads + Typesense)
# Usage:
#   ./scripts/backup.sh              # Docker mode (default)
#   ./scripts/backup.sh --local      # Local MySQL only (no volumes)
#
# Environment variables (optional):
#   BACKUP_DIR, RETENTION_DAYS, MYSQL_ROOT_PASSWORD, MYSQL_DATABASE
#   COMPOSE_PROJECT_NAME — docker volume prefix (default: directory name)
# ============================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_NAME="${MYSQL_DATABASE:-auditiq}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
MODE="docker"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-}"

if [[ "${1:-}" == "--local" ]]; then
  MODE="local"
fi

# Docker Compose volume names: {project}_{volume_key}
if [[ -z "$COMPOSE_PROJECT_NAME" ]]; then
  COMPOSE_PROJECT_NAME="$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')"
fi
UPLOADS_VOLUME="${COMPOSE_PROJECT_NAME}_document_uploads"
TYPESENSE_VOLUME="${COMPOSE_PROJECT_NAME}_typesense_data"

mkdir -p "$BACKUP_DIR"

DB_BACKUP="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
UPLOADS_BACKUP="${BACKUP_DIR}/uploads_${TIMESTAMP}.tar.gz"
TYPESENSE_BACKUP="${BACKUP_DIR}/typesense_${TIMESTAMP}.tar.gz"

echo "============================================="
echo " AuditIQ Full Backup — $(date)"
echo " Mode:      ${MODE}"
echo " Project:   ${COMPOSE_PROJECT_NAME}"
echo " Database:  ${DB_NAME}"
echo "============================================="

# ---------- MySQL ----------
echo "[1/3] MySQL dump..."
if [[ "$MODE" == "docker" ]]; then
  if [[ -z "${MYSQL_ROOT_PASSWORD:-}" ]] && [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a && source .env && set +a
  fi
  MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"

  if [[ -z "$MYSQL_ROOT_PASSWORD" ]]; then
    echo "ERROR: MYSQL_ROOT_PASSWORD not set"
    exit 1
  fi

  docker compose exec -T db mysqldump \
    --user=root \
    --password="$MYSQL_ROOT_PASSWORD" \
    --single-transaction \
    --routines \
    --triggers \
    --quick \
    "$DB_NAME" | gzip > "$DB_BACKUP"
else
  MYSQL_HOST="${MYSQL_HOST:-localhost}"
  MYSQL_PORT="${MYSQL_PORT:-3306}"
  MYSQL_USER="${MYSQL_USER:-root}"

  mysqldump \
    --host="$MYSQL_HOST" \
    --port="$MYSQL_PORT" \
    --user="$MYSQL_USER" \
    ${MYSQL_ROOT_PASSWORD:+--password="$MYSQL_ROOT_PASSWORD"} \
    --single-transaction \
    --routines \
    --triggers \
    --quick \
    "$DB_NAME" | gzip > "$DB_BACKUP"
fi

if [[ ! -s "$DB_BACKUP" ]]; then
  echo "ERROR: Database backup failed"
  rm -f "$DB_BACKUP"
  exit 1
fi
echo "  → $(du -h "$DB_BACKUP" | cut -f1) $DB_BACKUP"

# ---------- Document uploads volume ----------
if [[ "$MODE" == "docker" ]]; then
  echo "[2/3] Document uploads volume..."
  if docker volume inspect "$UPLOADS_VOLUME" >/dev/null 2>&1; then
    docker run --rm \
      -v "${UPLOADS_VOLUME}:/data:ro" \
      -v "$(cd "$BACKUP_DIR" && pwd):/backup" \
      alpine:3.20 \
      tar czf "/backup/uploads_${TIMESTAMP}.tar.gz" -C /data .
    echo "  → $(du -h "$UPLOADS_BACKUP" | cut -f1) $UPLOADS_BACKUP"
  else
    echo "  → skipped (volume $UPLOADS_VOLUME not found)"
    UPLOADS_BACKUP=""
  fi

  echo "[3/3] Typesense index volume..."
  if docker volume inspect "$TYPESENSE_VOLUME" >/dev/null 2>&1; then
    docker run --rm \
      -v "${TYPESENSE_VOLUME}:/data:ro" \
      -v "$(cd "$BACKUP_DIR" && pwd):/backup" \
      alpine:3.20 \
      tar czf "/backup/typesense_${TIMESTAMP}.tar.gz" -C /data .
    echo "  → $(du -h "$TYPESENSE_BACKUP" | cut -f1) $TYPESENSE_BACKUP"
  else
    echo "  → skipped (volume $TYPESENSE_VOLUME not found — reindex from documents if restored)"
    TYPESENSE_BACKUP=""
  fi
else
  echo "[2/3] Skipping volume backups in --local mode"
  echo "[3/3] Skipping Typesense in --local mode"
fi

# ---------- Retention ----------
DELETED=0
if [[ "$RETENTION_DAYS" -gt 0 ]]; then
  while IFS= read -r -d '' old_file; do
    rm -f "$old_file"
    DELETED=$((DELETED + 1))
  done < <(find "$BACKUP_DIR" -maxdepth 1 \( \
    -name "${DB_NAME}_*.sql.gz" -o \
    -name "uploads_*.tar.gz" -o \
    -name "typesense_*.tar.gz" \
  \) -mtime +"$RETENTION_DAYS" -print0 2>/dev/null)
fi

echo "============================================="
echo " Backup complete"
echo " MySQL:     $DB_BACKUP"
[[ -n "${UPLOADS_BACKUP:-}" && -f "$UPLOADS_BACKUP" ]] && echo " Uploads:   $UPLOADS_BACKUP"
[[ -n "${TYPESENSE_BACKUP:-}" && -f "$TYPESENSE_BACKUP" ]] && echo " Typesense: $TYPESENSE_BACKUP"
echo " Cleaned:   ${DELETED} old file(s)"
echo "============================================="
