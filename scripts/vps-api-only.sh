#!/usr/bin/env bash
# Clean VPS: stop frontend containers, run MySQL + API + nginx only.
# Usage (on VPS): bash scripts/vps-api-only.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Stop all-in-one / old stacks ==="
docker compose -f docker-compose.kvm2.yml --env-file .env.kvm2 down 2>/dev/null || true
docker compose -f docker-compose.yml down 2>/dev/null || true
docker compose down 2>/dev/null || true

if [[ ! -f .env.api ]]; then
  cp .env.api.example .env.api
  echo "Created .env.api from example — EDIT secrets before production use:"
  echo "  nano $ROOT/.env.api"
  echo "Required: MYSQL_ROOT_PASSWORD JWT_SECRET VAULT_ENCRYPTION_KEY"
  echo "  CLIENT_URL=https://auditiq.mkdandeker.com"
  echo "  DOMAIN=api.mkdandeker.com"
  echo "  COOKIE_DOMAIN=.mkdandeker.com"
  exit 1
fi

echo "=== Start API-only (db + server + nginx) ==="
docker compose -f docker-compose.api.yml --env-file .env.api up -d --build
docker compose -f docker-compose.api.yml --env-file .env.api ps

echo ""
echo "Next: certbot for api.mkdandeker.com (see docs/VERCEL_SPLIT.md)"
echo "Vercel env: VITE_API_URL=https://api.mkdandeker.com"
echo "Health: curl -s http://127.0.0.1/api/health"
