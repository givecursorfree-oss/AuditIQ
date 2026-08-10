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
3. Environment → Production:

```
VITE_API_URL=https://api.mkdandeker.com
```

4. Domain: add `auditiq.mkdandeker.com` → set DNS as Vercel instructs  
5. Deploy

## 3. Smoke test

1. https://auditiq.mkdandeker.com/login  
2. Login works; Network tab shows calls to `api.mkdandeker.com`  
3. Chat / sockets work  

## MySQL data note

`docker compose … down` **without** `-v` keeps the `mysql_data` volume.  
`down -v` **wipes the database** — only use if you want a fresh DB.

## Rollback to all-in-one VPS (if needed)

```bash
docker compose -f docker-compose.api.yml --env-file .env.api down
docker compose -f docker-compose.kvm2.yml --env-file .env.kvm2 up -d --build
```
