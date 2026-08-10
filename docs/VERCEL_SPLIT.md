# AuditIQ — Vercel (frontend) + VPS (API)

Recommended DNS:

| Host | Points to |
|------|-----------|
| `app.auditiq.mkdandeker.com` | Vercel |
| `api.auditiq.mkdandeker.com` | VPS IP |

## 1. VPS (API only)

```bash
cd /opt/auditiq
git pull
cp .env.api.example .env.api
nano .env.api   # set secrets + CLIENT_URL + DOMAIN
```

Stop the all-in-one stack if it is running:

```bash
docker compose -f docker-compose.kvm2.yml --env-file .env.kvm2 down
# or: docker compose down
```

Start API stack:

```bash
docker compose -f docker-compose.api.yml --env-file .env.api up -d --build
```

HTTPS for API host (after DNS A record for `api.…` is live):

```bash
docker compose -f docker-compose.api.yml --env-file .env.api run --rm certbot certonly \
  --webroot -w /var/www/certbot -d api.auditiq.mkdandeker.com \
  --email you@mkdandeker.com --agree-tos --no-eff-email
docker compose -f docker-compose.api.yml --env-file .env.api up -d nginx
```

Bootstrap admin + permissions (once):

```bash
docker compose -f docker-compose.api.yml --env-file .env.api exec -T server node scripts/bootstrap-admin.mjs
docker compose -f docker-compose.api.yml --env-file .env.api exec -T server node scripts/repair-role-permissions.mjs
```

## 2. Vercel (frontend)

1. Import GitHub repo `auditiq8-cell/AuditIQ` into Vercel.
2. Framework: Vite. Root: repo root (uses `vercel.json`).
3. Environment variable (Production):

```
VITE_API_URL=https://api.auditiq.mkdandeker.com
```

4. Add domain `app.auditiq.mkdandeker.com` in Vercel → set DNS CNAME as Vercel shows.
5. Deploy.

## 3. VPS `.env.api` must match

```
CLIENT_URL=https://app.auditiq.mkdandeker.com
DOMAIN=api.auditiq.mkdandeker.com
GOOGLE_REDIRECT_URI=https://api.auditiq.mkdandeker.com/api/integrations/google-drive/callback
```

Rebuild server after env change:

```bash
docker compose -f docker-compose.api.yml --env-file .env.api up -d server
```

## 4. Smoke test

1. Open `https://app.auditiq.mkdandeker.com/login`
2. Login → dashboard loads (no Access denied)
3. Chat / workpapers (WebSocket) work
4. DevTools → Network: API calls go to `api.…`, cookies set

## Notes

- Do **not** use `*.vercel.app` as the main app URL if you can avoid it (cookies need `COOKIE_SAMESITE=none`).
- Sibling subdomains under `mkdandeker.com` use `SameSite=Lax` automatically.
- Keep using kvm2 all-in-one (`docker-compose.kvm2.yml`) until DNS + Vercel are ready.
