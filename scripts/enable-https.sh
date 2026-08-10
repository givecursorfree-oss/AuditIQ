#!/usr/bin/env bash
# Enable HTTPS for AuditIQ app + api subdomain (same VPS, kvm2 by default).
# Usage:
#   ./scripts/enable-https.sh auditiq.mkdandeker.com you@email.com
#   ./scripts/enable-https.sh auditiq.mkdandeker.com you@email.com full

set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain> <email> [kvm2|full]}"
EMAIL="${2:?Usage: $0 <domain> <email> [kvm2|full]}"
MODE="${3:-kvm2}"
API_DOMAIN="api.${DOMAIN}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$MODE" == "full" ]]; then
  COMPOSE=(docker compose)
  ENV_FILE=".env"
else
  COMPOSE=(docker compose -f docker-compose.kvm2.yml --env-file .env.kvm2)
  ENV_FILE=".env.kvm2"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from example first."
  exit 1
fi

echo "=== AuditIQ HTTPS for ${DOMAIN} + ${API_DOMAIN} (${MODE}) ==="

set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

set_env DOMAIN "$DOMAIN"
set_env API_DOMAIN "$API_DOMAIN"
set_env CLIENT_URL "https://${DOMAIN}"
rm -f "${ENV_FILE}.bak"

echo "[1/4] Ensure HTTP client is up (ACME webroot on :80)..."
"${COMPOSE[@]}" up -d client

echo "[2/4] Request Let's Encrypt certificate (app + api)..."
CERTBOT=(run --rm certbot certonly --webroot -w /var/www/certbot
  -d "$DOMAIN" -d "$API_DOMAIN"
  --email "$EMAIL" --agree-tos --no-eff-email --force-renewal)

if [[ "$MODE" == "full" ]]; then
  "${COMPOSE[@]}" "${CERTBOT[@]}"
else
  "${COMPOSE[@]}" --profile ssl "${CERTBOT[@]}"
fi

echo "[3/4] Recreate client with HTTPS + api subdomain..."
"${COMPOSE[@]}" up -d --force-recreate client

echo "[4/4] Restart server (CLIENT_URL=https://${DOMAIN})..."
"${COMPOSE[@]}" up -d --force-recreate server

echo ""
echo "Done."
echo "  App: https://${DOMAIN}"
echo "  API: https://${API_DOMAIN}/api/health"
echo "Hostinger firewall MUST allow TCP 80 and 443."
echo ""
echo "Renewal cron (daily 3am):"
echo "  0 3 * * * cd ${ROOT} && ${COMPOSE[*]} --profile ssl run --rm certbot renew && ${COMPOSE[*]} exec client nginx -s reload"
