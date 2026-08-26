/**
 * Client-side mirror of server gradeCapabilities (keep in sync).
 */
export const GRADE = {
  SENIOR_AUDIT_MANAGER: 'SENIOR_AUDIT_MANAGER',
  AUDIT_MANAGER: 'AUDIT_MANAGER',
  SENIOR_AUDIT_EXECUTIVE: 'SENIOR_AUDIT_EXECUTIVE',
  AUDIT_EXECUTIVE: 'AUDIT_EXECUTIVE',
} as const;

export function canViewManagementInsights(
  role: string,
  hierarchyCode?: string | null
): boolean {
  if (role === 'Partner' || role === 'Admin') return true;
  if (role !== 'Manager') return false;
  return !hierarchyCode || hierarchyCode === GRADE.SENIOR_AUDIT_MANAGER;
}

export function canFirstLevelReview(role: string, hierarchyCode?: string | null): boolean {
  if (['Partner', 'Admin', 'Manager'].includes(role)) return true;
  if (role !== 'Staff') return false;
  return hierarchyCode === GRADE.SENIOR_AUDIT_EXECUTIVE;
}

export function canAttestTimesheets(role: string, hierarchyCode?: string | null): boolean {
  if (['Partner', 'Admin', 'Manager', 'HR'].includes(role)) return true;
  return role === 'Staff' && hierarchyCode === GRADE.SENIOR_AUDIT_EXECUTIVE;
}

export const AUDIT_MANAGER_DENIED_PATHS = ['/management-reports', '/admin/scheduler'] as const;
