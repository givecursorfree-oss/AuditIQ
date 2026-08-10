#!/usr/bin/env bash
# Enable HTTPS for AuditIQ app + separate API host on the same VPS.
# Usage:
#   ./scripts/enable-https.sh auditiq.mkdandeker.com you@email.com
#   ./scripts/enable-https.sh auditiq.mkdandeker.com you@email.com kvm2 api.mkdandeker.com
#
# Defaults: app = <domain>, API = api.<parent>  (auditiq.mkdandeker.com → api.mkdandeker.com)

set -euo pipefail

DOMAIN="${1:?Usage: $0 <app-domain> <email> [kvm2|full] [api-domain]}"
EMAIL="${2:?Usage: $0 <app-domain> <email> [kvm2|full] [api-domain]}"
MODE="${3:-kvm2}"
# 3rd arg may be api domain if user skips mode: detect
if [[ "$MODE" != "kvm2" && "$MODE" != "full" ]]; then
  API_DOMAIN="$MODE"
  MODE="kvm2"
else
  API_DOMAIN="${4:-}"
fi

if [[ -z "$API_DOMAIN" ]]; then
  # auditiq.mkdandeker.com → api.mkdandeker.com
  if [[ "$DOMAIN" == *.*.* ]]; then
    API_DOMAIN="api.${DOMAIN#*.}"
  else
    API_DOMAIN="api.${DOMAIN}"
  fi
fi

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

echo "=== AuditIQ HTTPS ==="
echo "  App: https://${DOMAIN}"
echo "  API: https://${API_DOMAIN}"
echo "  Mode: ${MODE}"

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

echo "[3/4] Recreate client with HTTPS + API host..."
"${COMPOSE[@]}" up -d --force-recreate client

echo "[4/4] Restart server (CLIENT_URL=https://${DOMAIN})..."
"${COMPOSE[@]}" up -d --force-recreate server

echo ""
echo "Done."
echo "  App: https://${DOMAIN}"
echo "  API: https://${API_DOMAIN}/api/health"
echo "Hostinger firewall MUST allow TCP 80 and 443."
echo ""
echo "DNS required:"
echo "  A  ${DOMAIN%%.*}     → VPS IP   (or full host as you already have)"
echo "  A  api             → same VPS IP   (for ${API_DOMAIN})"
echo ""
echo "Renewal cron (daily 3am):"
echo "  0 3 * * * cd ${ROOT} && ${COMPOSE[*]} --profile ssl run --rm certbot renew && ${COMPOSE[*]} exec client nginx -s reload"
