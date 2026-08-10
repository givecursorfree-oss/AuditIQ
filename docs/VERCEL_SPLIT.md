# AuditIQ — Vercel (frontend) + VPS (MySQL + API only)

| Host | Where |
|------|--------|
| `auditiq.mkdandeker.com` | **Vercel** (React) |
| `api.mkdandeker.com` | **VPS** (nginx → Node + MySQL) |

No React/`client` container on the VPS.

## DNS

| Type | Host | Value |
|------|------|--------|
| A | `api` | VPS IP |
| CNAME or A | `auditiq` | Vercel (as Vercel dashboard shows) |

## 1. Clean VPS → API only

SSH in, then paste:

```bash
cd /opt/auditiq
git remote set-url origin https://github.com/givecursorfree-oss/AuditIQ.git
git pull origin main

# Stop ALL old stacks (app+api together)
docker compose -f docker-compose.kvm2.yml --env-file .env.kvm2 down 2>/dev/null || true
docker compose down 2>/dev/null || true
docker compose -f docker-compose.yml down 2>/dev/null || true

# Optional: free unused images (keeps MySQL volume / data)
docker image prune -f

# API env
cp -n .env.api.example .env.api
nano .env.api
```

Set at least:

```bash
CLIENT_URL=https://auditiq.mkdandeker.com
DOMAIN=api.mkdandeker.com
COOKIE_DOMAIN=.mkdandeker.com
GOOGLE_REDIRECT_URI=https://api.mkdandeker.com/api/integrations/google-drive/callback
# + your real MYSQL_ROOT_PASSWORD, JWT_SECRET, VAULT_ENCRYPTION_KEY, TYPESENSE_API_KEY
```

If you already have `.env.kvm2` secrets, copy those password values into `.env.api` (same DB volume name `mysql_data` is reused only if project name matches — see note below).

Start backend only:

```bash
docker compose -f docker-compose.api.yml --env-file .env.api up -d --build
docker compose -f docker-compose.api.yml --env-file .env.api ps
```

HTTPS for API (DNS `api` must point here first):

```bash
docker compose -f docker-compose.api.yml --env-file .env.api --profile ssl run --rm certbot certonly \
  --webroot -w /var/www/certbot -d api.mkdandeker.com \
  --email you@mkdandeker.com --agree-tos --no-eff-email

# Switch nginx to HTTPS config
cp ops/nginx-api.https.conf ops/nginx-api.conf
docker compose -f docker-compose.api.yml --env-file .env.api up -d --force-recreate nginx
```

Admin + permissions (once):

```bash
docker compose -f docker-compose.api.yml --env-file .env.api exec -T server node scripts/bootstrap-admin.mjs
docker compose -f docker-compose.api.yml --env-file .env.api exec -T server node scripts/repair-role-permissions.mjs
```

Check:

```bash
curl -s https://api.mkdandeker.com/api/health
```

## 2. Vercel (frontend)

1. Import GitHub: `givecursorfree-oss/AuditIQ`
2. Root uses `vercel.json` (Vite → `client/dist`)
3. Production API URL is baked via `client/.env.production`:

```
VITE_API_URL=https://api.mkdandeker.com
```

   You may also set the same key in Vercel → Project → Settings → Environment Variables (overrides file).
4. Domain: add `auditiq.mkdandeker.com` → set DNS as Vercel instructs  
5. Deploy

**Why the crash happened:** without `VITE_API_URL`, the SPA called `https://audit-iq-one.vercel.app/api/...`. Vercel’s SPA rewrite returned `index.html` (HTTP 200), and React blew up reading `.length` on non-JSON data.

## 2b. VPS CORS for `*.vercel.app`

On the VPS `.env.api`, allow the Vercel host (in addition to your custom domain):

```bash
CLIENT_URL=https://auditiq.mkdandeker.com
CLIENT_ORIGINS=https://audit-iq-one.vercel.app
COOKIE_SAMESITE=none
COOKIE_DOMAIN=
```

Then recreate the API container:

```bash
docker compose -f docker-compose.api.yml --env-file .env.api up -d --force-recreate server
```

## 3. Smoke test

1. https://audit-iq-one.vercel.app/login (or https://auditiq.mkdandeker.com/login)  
2. Network tab shows calls to `api.mkdandeker.com` (not same-origin `/api`)  
3. `curl -s https://api.mkdandeker.com/api/health` returns JSON  
4. Chat / sockets work  

## MySQL data note

`docker compose … down` **without** `-v` keeps the `mysql_data` volume.  
`down -v` **wipes the database** — only use if you want a fresh DB.

## Rollback to all-in-one VPS (if needed)

```bash
docker compose -f docker-compose.api.yml --env-file .env.api down
docker compose -f docker-compose.kvm2.yml --env-file .env.kvm2 up -d --build
```
