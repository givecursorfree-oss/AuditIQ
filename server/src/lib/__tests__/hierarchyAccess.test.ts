import { describe, expect, it } from 'vitest';
import { apiPathAllowedForHierarchy } from '../hierarchyAccess.js';

describe('hierarchyAccess', () => {
  it('allows HR manager attendance and leave APIs', () => {
    expect(apiPathAllowedForHierarchy('HR_MANAGER', '/api/attendance/leaves')).toBe(true);
    expect(apiPathAllowedForHierarchy('HR_MANAGER', '/api/employees')).toBe(true);
  });

  it('allows HR manager time tracker APIs', () => {
    expect(apiPathAllowedForHierarchy('HR_MANAGER', '/api/engagements')).toBe(true);
    expect(apiPathAllowedForHierarchy('HR_MANAGER', '/api/tasks')).toBe(true);
    expect(apiPathAllowedForHierarchy('HR_MANAGER', '/api/time-entries')).toBe(true);
  });

  it('allows accounts manager billing and time tracker APIs', () => {
    expect(apiPathAllowedForHierarchy('ACCOUNTS_MANAGER', '/api/invoices')).toBe(true);
    expect(apiPathAllowedForHierarchy('ACCOUNTS_MANAGER', '/api/time-entries')).toBe(true);
    expect(apiPathAllowedForHierarchy('ACCOUNTS_MANAGER', '/api/engagements')).toBe(true);
    expect(apiPathAllowedForHierarchy('ACCOUNTS_MANAGER', '/api/tasks')).toBe(true);
  });

  it('passes through unscoped hierarchy codes', () => {
    expect(apiPathAllowedForHierarchy('AUDIT_EXECUTIVE', '/api/engagements')).toBe(true);
  });
});
