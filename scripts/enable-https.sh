#!/usr/bin/env bash
# Enable HTTPS for AuditIQ (kvm2 / 8 GB compose by default).
# Usage:
#   ./scripts/enable-https.sh auditiq.mkdandeker.com you@email.com
#   ./scripts/enable-https.sh auditiq.mkdandeker.com you@email.com full

set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain> <email> [kvm2|full]}"
EMAIL="${2:?Usage: $0 <domain> <email> [kvm2|full]}"
MODE="${3:-kvm2}"

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

echo "=== AuditIQ HTTPS setup for ${DOMAIN} (${MODE}) ==="

if grep -q '^DOMAIN=' "$ENV_FILE"; then
  sed -i.bak "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" "$ENV_FILE"
else
  echo "DOMAIN=${DOMAIN}" >> "$ENV_FILE"
fi
if grep -q '^CLIENT_URL=' "$ENV_FILE"; then
  sed -i.bak "s|^CLIENT_URL=.*|CLIENT_URL=https://${DOMAIN}|" "$ENV_FILE"
else
  echo "CLIENT_URL=https://${DOMAIN}" >> "$ENV_FILE"
fi
rm -f "${ENV_FILE}.bak"

echo "[1/4] Ensure HTTP client is up (ACME webroot on :80)..."
"${COMPOSE[@]}" up -d client

echo "[2/4] Request Let's Encrypt certificate..."
if [[ "$MODE" == "full" ]]; then
  "${COMPOSE[@]}" run --rm certbot certonly \
    --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --force-renewal
else
  "${COMPOSE[@]}" --profile ssl run --rm certbot certonly \
    --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --force-renewal
fi

echo "[3/4] Recreate client with HTTPS config..."
"${COMPOSE[@]}" up -d --force-recreate client

echo "[4/4] Restart server so cookies/CORS use https CLIENT_URL..."
"${COMPOSE[@]}" up -d --force-recreate server

echo ""
echo "Done. Open: https://${DOMAIN}"
echo "Hostinger firewall MUST allow TCP 443 (and 80) or phones will fail."
echo ""
echo "Renewal cron (daily 3am):"
echo "  0 3 * * * cd ${ROOT} && ${COMPOSE[*]} --profile ssl run --rm certbot renew && ${COMPOSE[*]} exec client nginx -s reload"
