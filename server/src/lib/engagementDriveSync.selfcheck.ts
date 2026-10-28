/**
 * Run: npx --yes tsx src/lib/engagementDriveSync.selfcheck.ts
 */
import { pickEngagementDriveConnectionUserIds } from './driveSync.js';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

const ordered = pickEngagementDriveConnectionUserIds(
  ['linker-a', null, 'linker-b', 'linker-a'],
  ['firm-x', 'linker-b', 'firm-y']
);
assert(ordered[0] === 'linker-a', `expected linker-a first, got ${ordered[0]}`);
assert(ordered[1] === 'linker-b', `expected linker-b second, got ${ordered[1]}`);
assert(ordered.includes('firm-x') && ordered.includes('firm-y'), 'firm fallbacks present');
assert(ordered.indexOf('linker-b') < ordered.indexOf('firm-x'), 'linker before firm-only');

const onlyFirm = pickEngagementDriveConnectionUserIds([null], ['u1']);
assert(onlyFirm[0] === 'u1', 'firm-only fallback');

console.log('engagementDriveSync.selfcheck: ok');
