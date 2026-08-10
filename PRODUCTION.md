# AuditIQ — Production deployment (CA firm VPS)

## Required environment variables

Copy `.env.example` to `.env` and set:

| Variable | Notes |
|----------|--------|
| `MYSQL_ROOT_PASSWORD` | Strong password |
| `JWT_SECRET` | Min 32 characters |
| `CLIENT_URL` | `https://your-domain.com` |
| `VAULT_ENCRYPTION_KEY` | 32+ byte secret (Drive tokens, password vault) |
| `TYPESENSE_API_KEY` | Random string — **not** the dev default |
| `ALLOW_STAFF_REGISTRATION` | `false` (first Partner via bootstrap only) |
| `COPILOT_ENABLED` | `false` unless firm accepts cloud LLM |
| `SKIP_EMAIL_VERIFICATION` | `false` when SMTP is configured |

## Deploy

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

## HTTPS

```bash
./scripts/enable-https.sh yourdomain.com admin@yourdomain.com
```

Then set `CLIENT_URL=https://yourdomain.com` in `.env` and `docker compose up -d server`.

Nginx uses `DOMAIN` from `.env` to render `client/nginx.https.template` (Let's Encrypt certs in `certbot_conf` volume).

## Backups

```bash
./scripts/backup.sh
```

Creates under `./backups/`:

- `auditiq_*.sql.gz` — MySQL
- `uploads_*.tar.gz` — document files volume
- `typesense_*.tar.gz` — search index (optional; can reindex from documents)

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

- [ ] Typesense and Tika **not** exposed on public ports (default compose)
- [ ] HTTPS via `./scripts/enable-https.sh`
- [ ] `COPILOT_ENABLED=false`
- [ ] `ALLOW_STAFF_REGISTRATION=false`
- [ ] Backup cron: `./scripts/backup.sh`

## Document search

Upload a PDF in **Document Library** → search a word that appears only inside the file. Requires Typesense + Tika containers running.

## Health

`GET /api/health` — returns database, Typesense, and Tika status.
