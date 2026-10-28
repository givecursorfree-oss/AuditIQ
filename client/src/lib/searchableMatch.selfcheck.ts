/**
 * Run: npx --yes tsx src/lib/searchableMatch.selfcheck.ts
 */
import { searchableMatch } from './searchableMatch.ts';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

const name = 'L&T GeoStructure Private Limited';
assert(searchableMatch(name, 'Geo'), 'Geo mid-word');
assert(searchableMatch(name, 'geo'), 'case-insensitive');
assert(searchableMatch(name, 'Structure'), 'Structure mid-word');
assert(searchableMatch(name, 'LT'), 'LT ignores &');
assert(searchableMatch(name, 'LT Geo'), 'multi-token');
assert(searchableMatch(name, 'private limited'), 'multi-token spaced');
assert(!searchableMatch(name, 'Acme'), 'non-match');
assert(searchableMatch(name, '  '), 'blank query matches all');

console.log('searchableMatch.selfcheck: ok');
