import { describe, expect, it } from 'vitest';
import { displayClientName, normalizeClientNameKey } from '../recordSource.js';
import { rowReadyToImport, type StagedEngagementRow } from '../engagementImport.js';

describe('client name matching', () => {
  it('normalises case and spaces', () => {
    expect(normalizeClientNameKey('  ABC   Pvt  Ltd ')).toBe('abc pvt ltd');
    expect(displayClientName('  ABC   Pvt  Ltd ')).toBe('ABC Pvt Ltd');
  });
});

describe('engagement import staging readiness', () => {
  const base: StagedEngagementRow = {
    rowIndex: 2,
    clientName: 'Acme',
    title: 'GSTR',
    type: 'GST',
    financialYear: '2025-26',
    partnerEmail: 'p@x.com',
    managerEmail: 'm@x.com',
    clientAction: 'create_new',
    partnerId: 'p1',
    managerId: 'm1',
    engagementDupAction: 'create_anyway',
    errors: [],
    warnings: [],
  };

  it('requires partner, manager, and resolved client/dup decisions', () => {
    expect(rowReadyToImport(base)).toBe(true);
    expect(rowReadyToImport({ ...base, partnerId: null })).toBe(false);
    expect(rowReadyToImport({ ...base, clientAction: 'unresolved' })).toBe(false);
    expect(rowReadyToImport({ ...base, engagementDupAction: 'unresolved' })).toBe(false);
    expect(rowReadyToImport({ ...base, errors: ['x'] })).toBe(false);
  });
});
