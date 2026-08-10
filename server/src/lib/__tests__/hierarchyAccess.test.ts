import { describe, expect, it } from 'vitest';
import { apiPathAllowedForHierarchy } from '../hierarchyAccess.js';

describe('hierarchyAccess', () => {
  it('allows HR manager attendance and leave APIs', () => {
    expect(apiPathAllowedForHierarchy('HR_MANAGER', '/api/attendance/leaves')).toBe(true);
    expect(apiPathAllowedForHierarchy('HR_MANAGER', '/api/employees')).toBe(true);
  });

  it('blocks HR manager from engagements', () => {
    expect(apiPathAllowedForHierarchy('HR_MANAGER', '/api/engagements/abc')).toBe(false);
  });

  it('allows accounts manager billing APIs only', () => {
    expect(apiPathAllowedForHierarchy('ACCOUNTS_MANAGER', '/api/invoices')).toBe(true);
    expect(apiPathAllowedForHierarchy('ACCOUNTS_MANAGER', '/api/time-entries')).toBe(true);
    expect(apiPathAllowedForHierarchy('ACCOUNTS_MANAGER', '/api/engagements')).toBe(false);
  });

  it('passes through unscoped hierarchy codes', () => {
    expect(apiPathAllowedForHierarchy('AUDIT_EXECUTIVE', '/api/engagements')).toBe(true);
  });
});
