/**
 * MKD hierarchy codes → allowed nav path prefixes.
 * Restricted tracks (HR / Accounts / Office). Audit Managers get denied-path gates.
 */
import { AUDIT_MANAGER_DENIED_PATHS } from './gradeCapabilities';
import type { User } from '@/types';

const HIERARCHY_ALLOWED_PATHS: Record<string, string[]> = {
  HR_MANAGER: ['/', '/attendance', '/leave-stipend', '/messages', '/employees', '/timesheets', '/time-tracker', '/clients'],
  ACCOUNTS_MANAGER: ['/', '/billing', '/time-tracker', '/messages'],
  SENIOR_OFFICE_ADMIN: ['/', '/documents', '/messages', '/clients'],
  OFFICE_EXECUTIVE: ['/', '/documents', '/messages'],
};

function normalizePath(pathname: string): string {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path.startsWith('/engagements/')) return '/engagements';
  if (path.startsWith('/requests/')) return '/requests';
  if (path.startsWith('/client/')) return path.split('/').slice(0, 3).join('/') || '/client/dashboard';
  return path;
}

function deniedByAuditManagerGrade(user: User, path: string): boolean {
  if (user.hierarchyLevel?.code !== 'AUDIT_MANAGER') return false;
  return AUDIT_MANAGER_DENIED_PATHS.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/')
  );
}

/** Returns false when hierarchy scope blocks this route. */
export function passesHierarchyRouteGate(
  user: User | null | undefined,
  pathname: string,
  search = ''
): boolean {
  if (!user || user.role === 'Client') return true;
  const path = normalizePath(pathname);
  if (deniedByAuditManagerGrade(user, path)) return false;

  if (!user.hierarchyLevel?.code) return true;
  const allowed = HIERARCHY_ALLOWED_PATHS[user.hierarchyLevel.code];
  if (!allowed) return true;

  const tab = new URLSearchParams(search).get('tab');

  if (path === '/leave-stipend') {
    if (user.hierarchyLevel.code === 'HR_MANAGER') return true;
    return false;
  }

  void tab;
  return allowed.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

export function passesHierarchyNavGate(user: User | null | undefined, itemPath: string): boolean {
  if (!user || user.role === 'Client') return true;
  const path = itemPath.replace(/\/$/, '') || '/';
  if (deniedByAuditManagerGrade(user, path)) return false;

  if (!user.hierarchyLevel?.code) return true;
  const allowed = HIERARCHY_ALLOWED_PATHS[user.hierarchyLevel.code];
  if (!allowed) return true;
  return allowed.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}
