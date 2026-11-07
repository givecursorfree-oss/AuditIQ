/**
 * Runnable check: npx tsx src/lib/__tests__/firmServiceCatalog.selfcheck.ts
 */
import assert from 'node:assert/strict';
import {
  normalizeServiceCodeInput,
  validateFirmServiceInput,
} from '../firmServiceCatalog.js';

assert.equal(normalizeServiceCodeInput('gstr-9'), 'GSTR_9');
assert.equal(normalizeServiceCodeInput('  My Service!  '), 'MY_SERVICE');

const ok = validateFirmServiceInput({
  code: 'custom_gst',
  name: 'Custom GST',
  domain: 'IDT',
  templateId: 'IDT_GST_RETURN',
  recurrence: 'monthly',
});
assert.equal(ok.ok, true);
if (ok.ok) assert.equal(ok.data.code, 'CUSTOM_GST');

const bad = validateFirmServiceInput({
  code: 'X',
  name: '',
  domain: 'DT',
  templateId: 'DT_COMPLIANCE',
});
assert.equal(bad.ok, false);

console.log('firmServiceCatalog.selfcheck: ok');
