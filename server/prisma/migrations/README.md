# Prisma migrations

## New environments

```bash
cd server
npx prisma migrate deploy
```

Docker production server runs `migrate deploy` automatically on start (see `docker-entrypoint.sh`).

## Existing database already on `db push`

If columns/tables from a migration already exist, mark it as applied without re-running SQL:

```bash
npx prisma migrate resolve --applied 20250527120000_document_search_drive
npx prisma migrate resolve --applied 20250602120000_client_audit_queries
```

For local dev after pulling these changes, `npm run db:push` from the repo root is also fine.

## Create a new migration (development)

```bash
npx prisma migrate dev --name your_change_name
```

Do not use `db push` on production — use `migrate deploy` only.
