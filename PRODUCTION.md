# AuditIQ — Production deployment (CA firm VPS)

## 8 GB VPS (Hostinger KVM 2) — use this now

**Do not** run full `docker-compose.yml` on 8 GB RAM (Typesense + Tika need ~3 GB extra).

Use the kvm2 stack (MySQL + server + client only; document search falls back to MySQL / `pdf-parse`):

```bash
cp .env.kvm2.example .env.kvm2
# edit secrets, CLIENT_URL, DOMAIN
docker compose -f docker-compose.kvm2.yml --env-file .env.kvm2 up -d --build
```

Or from repo root: `npm run docker:up:kvm2`

GitHub **Deploy** workflow is **manual only** (Actions → Deploy → Run workflow). Pushing to `main` does **not** update the VPS until you run that workflow.

When you have **16 GB+**, you can switch to full `docker-compose.yml` (Typesense + Tika).

## Vercel frontend + VPS API

See [docs/VERCEL_SPLIT.md](docs/VERCEL_SPLIT.md). Use `docker-compose.api.yml` on the VPS and deploy `client` to Vercel with `VITE_API_URL`.

## Required environment variables

### kvm2 (8 GB) — copy `.env.kvm2.example` → `.env.kvm2`

| Variable | Notes |
|----------|--------|
| `MYSQL_ROOT_PASSWORD` | Strong password |
| `JWT_SECRET` | Min 32 characters |
| `CLIENT_URL` | `http://YOUR_VPS_IP` or `https://your-domain.com` |
| `VAULT_ENCRYPTION_KEY` | 32+ byte secret (Drive tokens, password vault) |
| `ALLOW_STAFF_REGISTRATION` | `false` (first Partner via bootstrap only) |
| `SKIP_EMAIL_VERIFICATION` | `true` until SMTP is configured |

### Full stack (16 GB+) — copy `.env.example` → `.env`

Also set `TYPESENSE_API_KEY` (not the dev default), `COPILOT_ENABLED=false` unless accepted.

## Deploy (full stack, 16 GB+ only)

```bash
docker compose up -d db
# wait for healthy (~30s)
docker compose up -d
```

The **server** container runs `prisma migrate deploy` on start automatically.

**Existing DB** that already has document-search columns? Mark migration as applied once:

```bash
docker compose run --rm server npx prisma migrate resolve --applied 20250527120000_document_search_drive
```

First login: with `ALLOW_STAFF_REGISTRATION=false`, the **first** staff register still works once on an empty database. After that, create users in **Settings → Admin**.

## Prisma on VPS

- **Production:** `npx prisma migrate deploy` (automatic on server start)
- **Development:** `npm run db:migrate` (creates new migrations)
- See `server/prisma/migrations/README.md`

## HTTPS (required for phones / all devices)

Many phones open `https://` first. If Hostinger firewall blocks **443**, those devices fail while desktop HTTP still works.

1. Hostinger → VPS → Firewall → allow **TCP 80** and **TCP 443** (and **22** for SSH).
2. On the VPS:

```bash
cd /opt/auditiq
git pull
chmod +x scripts/enable-https.sh
./scripts/enable-https.sh auditiq.mkdandeker.com YOUR_EMAIL@example.com
```

3. Confirm: https://auditiq.mkdandeker.com and `/api/health`

DNS for `auditiq.mkdandeker.com` must be an **A record → your VPS IP** (already `200.141.12.215` if unchanged).

Then set `CLIENT_URL=https://auditiq.mkdandeker.com` and `DOMAIN=auditiq.mkdandeker.com` in `.env.kvm2` (the script does this) and recreate:

```bash
docker compose -f docker-compose.kvm2.yml --env-file .env.kvm2 up -d client server
```

Nginx uses `DOMAIN` to render `client/nginx.https.template` only when Let's Encrypt cert files exist (safe if DOMAIN is set early).

## Backups

```bash
./scripts/backup.sh
```

Creates under `./backups/`:

- `auditiq_*.sql.gz` — MySQL
- `uploads_*.tar.gz` — document files volume
- `typesense_*.tar.gz` — search index (only if Typesense is running; skip on kvm2)

Cron example (daily 2am):

```cron
0 2 * * * cd /opt/auditiq && ./scripts/backup.sh >> /var/log/auditiq-backup.log 2>&1
```

## Tests

```bash
cd server && npm test
```

CI runs authz unit tests on every push.

## Security checklist

- [ ] On 8 GB: running `docker-compose.kvm2.yml` (no Typesense/Tika containers)
- [ ] Typesense and Tika **not** exposed on public ports (if using full compose)
- [ ] HTTPS via `./scripts/enable-https.sh`
- [ ] `ALLOW_STAFF_REGISTRATION=false`
- [ ] Backup cron: `./scripts/backup.sh`

## Document search

- **kvm2 (8 GB):** MySQL text search + `pdf-parse` for PDFs. Typesense/Tika reported as unreachable in health — expected.
- **Full stack:** Upload a PDF in **Document Library** → search a word inside the file. Needs Typesense + Tika.

## Health

`GET /api/health` — database must be `ok`. On kvm2, Typesense/Tika may be `unreachable` (normal).
