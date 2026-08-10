#!/usr/bin/env bash
# Enable HTTPS for AuditIQ after obtaining Let's Encrypt certificates.
# Usage: ./scripts/enable-https.sh yourdomain.com admin@example.com

set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain> <email>}"
EMAIL="${2:?Usage: $0 <domain> <email>}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== AuditIQ HTTPS setup for ${DOMAIN} ==="

# Persist domain for nginx entrypoint
if grep -q '^DOMAIN=' .env 2>/dev/null; then
  sed -i.bak "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
  rm -f .env.bak
else
  echo "DOMAIN=${DOMAIN}" >> .env
fi

echo "[1/3] Starting client (ACME webroot)..."
docker compose up -d client

echo "[2/3] Requesting certificate..."
docker compose run --rm certbot certonly \
  --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --force-renewal

echo "[3/3] Rebuilding client with DOMAIN=${DOMAIN}..."
docker compose up -d --build client

echo ""
echo "Done. Verify: https://${DOMAIN}"
echo "Set CLIENT_URL=https://${DOMAIN} in .env and restart server:"
echo "  docker compose up -d server"
echo ""
echo "Renewal cron (daily check at 3am):"
echo "  0 3 * * * cd ${ROOT} && docker compose run --rm certbot renew && docker compose exec client nginx -s reload"
