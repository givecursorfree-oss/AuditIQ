#!/bin/sh
set -e

# Only switch to HTTPS when DOMAIN is set AND Let's Encrypt files exist.
# Otherwise keep HTTP — avoids a dead site when DOMAIN is set before certs.
CERT="/etc/letsencrypt/live/${DOMAIN:-_none_}/fullchain.pem"
KEY="/etc/letsencrypt/live/${DOMAIN:-_none_}/privkey.pem"

# Default API host: api.<parent> e.g. DOMAIN=auditiq.mkdandeker.com → api.mkdandeker.com
# (not api.auditiq.mkdandeker.com). Override with API_DOMAIN env.
if [ -z "${API_DOMAIN:-}" ] && [ -n "${DOMAIN:-}" ]; then
  case "$DOMAIN" in
    *.*.*) API_DOMAIN="api.${DOMAIN#*.}" ;;
    *)     API_DOMAIN="api.${DOMAIN}" ;;
  esac
  export API_DOMAIN
fi

if [ -n "${DOMAIN:-}" ] && [ -f "$CERT" ] && [ -f "$KEY" ] && [ -f /etc/nginx/templates/https.conf.template ]; then
  echo "Configuring nginx for HTTPS: ${DOMAIN} (API: ${API_DOMAIN:-none})"
  envsubst '${DOMAIN} ${API_DOMAIN}' < /etc/nginx/templates/https.conf.template > /etc/nginx/conf.d/default.conf
else
  if [ -n "${DOMAIN:-}" ]; then
    echo "DOMAIN=${DOMAIN} set but certs missing — staying on HTTP until enable-https.sh succeeds"
  else
    echo "Using HTTP-only nginx config (set DOMAIN + certs for HTTPS)"
  fi
  # Always inject optional API_DOMAIN block into HTTP config when set
  if [ -n "${API_DOMAIN:-}" ] && [ -f /etc/nginx/templates/api-http.conf.template ]; then
    envsubst '${API_DOMAIN}' < /etc/nginx/templates/api-http.conf.template > /etc/nginx/conf.d/api.conf
    echo "API subdomain HTTP: ${API_DOMAIN}"
  fi
fi

exec nginx -g 'daemon off;'
