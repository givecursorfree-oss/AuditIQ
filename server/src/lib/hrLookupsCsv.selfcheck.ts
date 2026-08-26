/**
 * ponytail: assert parseHrClientCsv header + one-column modes.
 */
import { parseHrClientCsv } from './hrLookups.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const rich = parseHrClientCsv(
  'name,pan,gstin,contactEmail,contactPhone\n"Acme Ltd",ABCDE1234F,33AAAAA0000A1Z5,a@b.com,999\n'
);
assert(rich.length === 1 && rich[0].name === 'Acme Ltd', 'rich row');
assert(rich[0].pan === 'ABCDE1234F', 'pan');

const plain = parseHrClientCsv('Client A\nClient B\n');
assert(plain.length === 2 && plain[0].name === 'Client A', 'plain list');

console.log('hrLookups csv selfcheck: ok');
