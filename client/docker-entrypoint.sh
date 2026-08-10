#!/bin/sh
set -e

if [ -n "${DOMAIN:-}" ] && [ -f /etc/nginx/templates/https.conf.template ]; then
  echo "Configuring nginx for HTTPS: ${DOMAIN}"
  envsubst '${DOMAIN}' < /etc/nginx/templates/https.conf.template > /etc/nginx/conf.d/default.conf
else
  echo "Using HTTP-only nginx config (set DOMAIN + certs for HTTPS)"
fi

exec nginx -g 'daemon off;'
