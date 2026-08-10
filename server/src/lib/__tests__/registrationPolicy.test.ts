import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * Mirrors registration lock policy from auth route:
 * staff signup allowed only when userCount === 0 OR ALLOW_STAFF_REGISTRATION === true
 */
function staffRegistrationAllowed(
  userCount: number,
  allowStaffRegistration: boolean
): boolean {
  return userCount === 0 || allowStaffRegistration;
}

describe('staff registration policy', () => {
  it('allows first user bootstrap when DB is empty', () => {
    expect(staffRegistrationAllowed(0, false)).toBe(true);
  });

  it('blocks open registration in production default', () => {
    expect(staffRegistrationAllowed(5, false)).toBe(false);
  });

  it('allows when explicitly enabled for dev', () => {
    expect(staffRegistrationAllowed(5, true)).toBe(true);
  });
});

describe('env flags schema', () => {
  const flagSchema = z.preprocess(
    (v) => (v === undefined || v === '' ? 'false' : v),
    z.enum(['true', 'false']).transform((x) => x === 'true')
  );

  it('defaults boolean env flags to false', () => {
    expect(flagSchema.parse(undefined)).toBe(false);
    expect(flagSchema.parse('')).toBe(false);
  });

  it('parses true only when explicit', () => {
    expect(flagSchema.parse('true')).toBe(true);
    expect(flagSchema.parse('false')).toBe(false);
  });
});
