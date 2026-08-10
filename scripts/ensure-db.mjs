#!/usr/bin/env node
/**
 * Apply Prisma migrations before dev server start.
 * Falls back to idempotent SQL repair when migrate history is behind schema (local dev).
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'server');

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: serverDir, stdio: 'inherit', ...opts });
}

function tryRun(cmd) {
  try {
    run(cmd);
    return true;
  } catch {
    return false;
  }
}

console.log('[ensure-db] Checking database schema…');

let schemaOk = false;

if (tryRun('npx prisma migrate deploy')) {
  schemaOk = true;
} else {
  console.warn('[ensure-db] migrate deploy failed — trying idempotent schema repair…');
  if (tryRun('npx tsx scripts/apply-pending-schema.ts')) {
    schemaOk = true;
  } else {
    console.warn('[ensure-db] schema repair failed — trying prisma db push (last resort)…');
    if (tryRun('npx prisma db push --skip-generate')) {
      schemaOk = true;
    }
  }
}

if (!schemaOk) {
  console.warn(
    '\n[ensure-db] ⚠ Database schema could not be updated — timer, presence & workflow APIs may fail.\n' +
      '  • Start MySQL (XAMPP on port 3306, or: npm run db:up with Docker Desktop running)\n' +
      '  • Then run: npm run db:migrate\n' +
      '  • Or repair manually: cd server && npx tsx scripts/apply-pending-schema.ts\n'
  );
  process.exit(0);
}

tryRun('npx prisma generate');
tryRun('npx tsx scripts/sync-nav-permissions.ts');
console.log('[ensure-db] Database schema is up to date.');
