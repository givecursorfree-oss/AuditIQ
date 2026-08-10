#!/bin/sh
set -e

# Only switch to HTTPS when DOMAIN is set AND Let's Encrypt files exist.
# Otherwise keep HTTP — avoids a dead site when DOMAIN is set before certs.
CERT="/etc/letsencrypt/live/${DOMAIN:-_none_}/fullchain.pem"
KEY="/etc/letsencrypt/live/${DOMAIN:-_none_}/privkey.pem"

if [ -n "${DOMAIN:-}" ] && [ -f "$CERT" ] && [ -f "$KEY" ] && [ -f /etc/nginx/templates/https.conf.template ]; then
  echo "Configuring nginx for HTTPS: ${DOMAIN}"
  envsubst '${DOMAIN}' < /etc/nginx/templates/https.conf.template > /etc/nginx/conf.d/default.conf
else
  if [ -n "${DOMAIN:-}" ]; then
    echo "DOMAIN=${DOMAIN} set but certs missing — staying on HTTP until enable-https.sh succeeds"
  else
    echo "Using HTTP-only nginx config (set DOMAIN + certs for HTTPS)"
  fi
fi

exec nginx -g 'daemon off;'
