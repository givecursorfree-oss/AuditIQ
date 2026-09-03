import { describe, expect, it } from 'vitest';
import {
  engagementAccessWhereForProfile,
  hasFirmWideEngagementAccess,
  isAccountsManager,
} from '../engagementAccessPolicy.js';

describe('engagementAccessPolicy', () => {
  it('grants firm-wide access to Partner and Senior Audit Manager only among managers', () => {
    expect(hasFirmWideEngagementAccess('Partner', null)).toBe(true);
    expect(hasFirmWideEngagementAccess('Manager', 'SENIOR_AUDIT_MANAGER')).toBe(true);
    expect(hasFirmWideEngagementAccess('Manager', 'AUDIT_MANAGER')).toBe(false);
    expect(hasFirmWideEngagementAccess('Manager', 'EXECUTIVE_MANAGER')).toBe(false);
    expect(hasFirmWideEngagementAccess('HR', 'HR_MANAGER')).toBe(true);
  });

  it('scopes Audit Manager to assigned engagements', () => {
    const where = engagementAccessWhereForProfile({
      userId: 'u-am',
      role: 'Manager',
      firmId: 'firm-1',
      hierarchyCode: 'AUDIT_MANAGER',
      reportsToId: null,
    });
    expect(where).toHaveProperty('OR');
    expect(where).not.toEqual({ firmId: 'firm-1' });
  });

  it('scopes Accounts Manager to billing-related engagements', () => {
    expect(isAccountsManager('Accounts', 'ACCOUNTS_MANAGER')).toBe(true);
    const where = engagementAccessWhereForProfile({
      userId: 'u-ac',
      role: 'Accounts',
      firmId: 'firm-1',
      hierarchyCode: 'ACCOUNTS_MANAGER',
      reportsToId: null,
    });
    expect(where).toHaveProperty('OR');
  });

  it('includes supervisor engagements for interns', () => {
    const where = engagementAccessWhereForProfile({
      userId: 'u-intern',
      role: 'Intern',
      firmId: 'firm-1',
      hierarchyCode: 'INTERN',
      reportsToId: 'u-sup',
    });
    expect(Array.isArray(where.OR)).toBe(true);
    expect((where.OR as unknown[]).length).toBeGreaterThan(1);
  });
});
