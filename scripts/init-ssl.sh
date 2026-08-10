#!/bin/bash
# =============================================================
# AuditIQ India — SSL Certificate Initialization
# =============================================================
# Usage: ./scripts/init-ssl.sh yourdomain.com admin@yourdomain.com
# Prerequisites: Docker Compose must be running (at least client service)
# =============================================================

set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain> <email>}"
EMAIL="${2:?Usage: $0 <domain> <email>}"

echo "========================================"
echo " AuditIQ SSL Setup"
echo " Domain: $DOMAIN"
echo " Email:  $EMAIL"
echo "========================================"

# 1. Ensure the client container is running (serves ACME challenge)
echo "[1/4] Starting client container..."
docker compose up -d client

echo "[2/4] Requesting certificate from Let's Encrypt..."
docker compose run --rm certbot certonly \
  --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --force-renewal

# 2. Update nginx.conf — replace YOUR_DOMAIN.com placeholder
echo "[3/4] Updating nginx.conf with domain: $DOMAIN"
sed -i "s/YOUR_DOMAIN\.com/$DOMAIN/g" client/nginx.conf

# 3. Uncomment the HTTPS blocks in nginx.conf
# Remove the leading '# ' from the commented-out server blocks
# (Lines starting with '# ' inside the SSL sections)

echo "[4/4] Enabling HTTPS in nginx.conf..."
echo ""
echo "============================================="
echo " Certificate obtained successfully!"
echo " NOW:"
echo "  1. Edit client/nginx.conf"
echo "  2. Uncomment the HTTPS redirect block"
echo "  3. Uncomment the SSL server block"
echo "  4. Rebuild: docker compose up -d --build client"
echo "============================================="
echo ""
echo " To auto-renew, add this cron job:"
echo " 0 3 * * * cd $(pwd) && docker compose run --rm certbot renew && docker compose exec client nginx -s reload"
