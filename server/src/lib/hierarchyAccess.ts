/**
 * MKD hierarchy → allowed API path prefixes (server-side enforcement).
 * Partner/Admin bypass in middleware. Mirrors client hierarchyAccess.ts.
 */

export const HIERARCHY_API_PREFIXES: Record<string, string[]> = {
  HR_MANAGER: [
    '/api/attendance',
    '/api/employees',
    '/api/stipend',
    '/api/articleship',
    '/api/dashboard',
    '/api/notifications',
    '/api/nav-badges',
    '/api/chat',
    '/api/presence',
    '/api/staff',
    '/api/config',
  ],
  ACCOUNTS_MANAGER: [
    '/api/invoices',
    '/api/time-entries',
    '/api/stopwatch',
    '/api/dashboard',
    '/api/notifications',
    '/api/nav-badges',
    '/api/chat',
    '/api/presence',
    '/api/config',
  ],
  SENIOR_OFFICE_ADMIN: [
    '/api/documents',
    '/api/clients',
    '/api/dashboard',
    '/api/notifications',
    '/api/nav-badges',
    '/api/chat',
    '/api/presence',
    '/api/config',
  ],
  OFFICE_EXECUTIVE: [
    '/api/documents',
    '/api/dashboard',
    '/api/notifications',
    '/api/nav-badges',
    '/api/chat',
    '/api/presence',
    '/api/config',
  ],
};

/** Roles that use hierarchy scoping (not full audit staff). */
export const HIERARCHY_SCOPED_ROLES = new Set(['HR', 'Accounts', 'Staff', 'Intern']);

export function apiPathAllowedForHierarchy(hierarchyCode: string, requestPath: string): boolean {
  const prefixes = HIERARCHY_API_PREFIXES[hierarchyCode];
  if (!prefixes) return true;
  const path = requestPath.split('?')[0];
  return prefixes.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}
