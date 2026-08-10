import { describe, expect, it } from 'vitest';
import {
  isFirmLeadershipRole,
  isPartnerAdminRole,
  isPrivilegedRole,
} from '../permissions.js';

describe('permissions', () => {
  it('identifies firm leadership roles', () => {
    expect(isFirmLeadershipRole('Partner')).toBe(true);
    expect(isFirmLeadershipRole('Admin')).toBe(true);
    expect(isFirmLeadershipRole('Manager')).toBe(true);
    expect(isFirmLeadershipRole('Staff')).toBe(false);
  });

  it('keeps partner/admin distinct from manager for privileged ops', () => {
    expect(isPartnerAdminRole('Manager')).toBe(false);
    expect(isPrivilegedRole('Manager')).toBe(false);
    expect(isPartnerAdminRole('Partner')).toBe(true);
  });
});
