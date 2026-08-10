#!/bin/bash
# =============================================================
# AuditIQ India — SSL Certificate Renewal
# =============================================================
# Run via cron: 0 3 * * * /path/to/scripts/renew-ssl.sh >> /var/log/certbot-renew.log 2>&1
# =============================================================

set -euo pipefail

cd "$(dirname "$0")/.."

echo "[$(date)] Starting certificate renewal check..."

docker compose run --rm certbot renew --quiet

# Reload nginx to pick up new certificates
docker compose exec client nginx -s reload

echo "[$(date)] Renewal check complete."
