#!/usr/bin/env node
/**
 * AuditIQ document search verification (run after npm run dev).
 * Usage: node scripts/verify-search.mjs [email] [password]
 */
const BASE = process.env.API_URL || 'http://localhost:3001';
const email = process.argv[2] || 'admin@auditiq.in';
const password = process.argv[3] || 'Admin@123';

const checks = [];

function pass(name, detail) {
  checks.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('\nAuditIQ Document Search — Verification\n');
  console.log(`API: ${BASE}\n`);

  // 1. Health
  try {
    const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
    if (health.checks?.database === 'ok') pass('Database', 'connected');
    else fail('Database', health.checks?.database);
    if (health.checks?.typesense === 'ok') pass('Typesense', 'reachable (semantic search available)');
    else fail('Typesense', health.checks?.typesense || 'unreachable — run: npm run search:up');
    if (health.checks?.tika === 'ok') pass('Tika', 'reachable (full text extraction)');
    else fail('Tika', health.checks?.tika || 'unreachable — run: npm run search:up');
  } catch (e) {
    fail('API health', (e).message);
    console.log('\nStart the server: npm run dev\n');
    process.exit(1);
  }

  // 2. Public config
  try {
    const config = await fetch(`${BASE}/api/config`).then((r) => r.json());
    if (config.documentSearch) {
      pass('Search config', `mode=${config.documentSearch.mode}, semantic=${config.documentSearch.semantic}`);
    } else {
      fail('Search config', 'documentSearch missing — restart server (stale build?)');
    }
  } catch (e) {
    fail('Search config', (e).message);
  }

  // 3. Login
  let cookie = '';
  try {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = await loginRes.json();
    if (!loginRes.ok) {
      fail('Login', loginBody.error || loginRes.status);
    } else {
      const setCookie = loginRes.headers.getSetCookie?.() || [];
      const raw = loginRes.headers.get('set-cookie') || '';
      cookie = setCookie[0]?.split(';')[0] || raw.split(';')[0] || '';
      pass('Login', loginBody.user?.email);
    }
  } catch (e) {
    fail('Login', (e).message);
  }

  if (!cookie) {
    printSummary();
    process.exit(1);
  }

  const authHeaders = { Cookie: cookie, 'Content-Type': 'application/json' };

  // 4. Search endpoint
  try {
    const searchRes = await fetch(`${BASE}/api/search/documents?q=test&limit=5`, {
      headers: authHeaders,
    });
    const searchBody = await searchRes.json();
    if (searchRes.ok) {
      pass('Search API', `backend=${searchBody.backend}, results=${searchBody.results?.length ?? 0}`);
    } else {
      fail('Search API', searchBody.error || searchRes.status);
    }
  } catch (e) {
    fail('Search API', (e).message);
  }

  // 5. Reindex queue (admin)
  try {
    const reindexRes = await fetch(`${BASE}/api/search/reindex`, {
      method: 'POST',
      headers: authHeaders,
    });
    const reindexBody = await reindexRes.json();
    if (reindexRes.ok) {
      pass('Reindex queue', `${reindexBody.queued} document(s) queued`);
    } else if (reindexRes.status === 403) {
      pass('Reindex queue', 'skipped (requires Partner/Admin)');
    } else {
      fail('Reindex queue', reindexBody.error || reindexRes.status);
    }
  } catch (e) {
    fail('Reindex queue', (e).message);
  }

  printSummary();
}

function printSummary() {
  const ok = checks.filter((c) => c.ok).length;
  const total = checks.length;
  console.log(`\n${'─'.repeat(48)}`);
  console.log(`Result: ${ok}/${total} checks passed\n`);
  const tsDown = checks.find((c) => c.name === 'Typesense' && !c.ok);
  if (tsDown) {
    console.log('Semantic search requires Docker:');
    console.log('  1. Install Docker Desktop');
    console.log('  2. npm run search:up');
    console.log('  3. Restart npm run dev');
    console.log('  4. node scripts/verify-search.mjs\n');
  } else {
    console.log('Document search stack is operational.\n');
  }
  process.exit(ok === total ? 0 : 1);
}

main();
