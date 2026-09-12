import assert from 'node:assert/strict';
import { formatStaffTitle } from '../staffTitle.js';

// ponytail: self-check for designation vs raw Staff role
assert.equal(
  formatStaffTitle({ role: 'Staff', designation: 'Audit Executive (Article)' }),
  'Audit Executive (Article)'
);
assert.equal(
  formatStaffTitle({ role: 'Staff', hierarchyLevel: { title: 'Audit Executive' } }),
  'Audit Executive'
);
assert.equal(formatStaffTitle({ role: 'Staff' }), 'Audit Executive');
assert.equal(
  formatStaffTitle({
    role: 'Staff',
    designation: 'Article Executive',
    hierarchyLevel: { title: 'Audit Executive' },
  }),
  'Article Executive'
);

console.log('staffTitle.selfcheck: ok');
