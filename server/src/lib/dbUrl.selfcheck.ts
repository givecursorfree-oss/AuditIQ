/**
 * ponytail: runnable check for pool URL helper.
 * Run: npx --yes tsx src/lib/dbUrl.selfcheck.ts
 */
import { withPrismaPoolParams } from './dbUrl.js';
import assert from 'node:assert/strict';

const base = 'mysql://root:secret@db:3306/auditiq';
const out = withPrismaPoolParams(base);
assert.match(out, /connection_limit=25/);
assert.match(out, /pool_timeout=20/);
assert.match(out, /connect_timeout=10/);

const custom = withPrismaPoolParams(`${base}?connection_limit=10&foo=1`);
assert.match(custom, /connection_limit=10/);
assert.match(custom, /foo=1/);
assert.match(custom, /pool_timeout=20/);
assert.doesNotMatch(custom, /connection_limit=25/);

console.log('dbUrl.selfcheck: ok');
