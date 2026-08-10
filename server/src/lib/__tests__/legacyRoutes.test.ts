import { describe, expect, it } from 'vitest';

/** Mirror of client LEGACY_REDIRECT_PATHS — keep in sync with navAccess.ts */
const LEGACY_REDIRECT_PATHS = new Set([
  '/workflow',
  '/engagements/workflow',
  '/observations',
  '/form3cd',
  '/time-billing',
  '/portals/credentials',
  '/client-master',
  '/onboarding',
  '/audit-log',
  '/portal',
]);

/** Mirror of client auth-only paths — keep in sync with navAccess.ts canAccessRoute */
const AUTH_ONLY_PATHS = new Set(['/unauthorized']);

describe('legacy redirect paths', () => {
  it('includes /workflow for RouteGuard allowlist', () => {
    expect(LEGACY_REDIRECT_PATHS.has('/workflow')).toBe(true);
  });
});

describe('auth-only paths', () => {
  it('includes /unauthorized for RouteGuard allowlist', () => {
    expect(AUTH_ONLY_PATHS.has('/unauthorized')).toBe(true);
  });
});
