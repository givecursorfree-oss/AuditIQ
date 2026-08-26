/**
 * CA firm grade capabilities (MKD hierarchy).
 * JWT role is coarse; hierarchy code differentiates Senior Manager / Senior Exec / Office.
 */

export const GRADE = {
  PARTNER: 'PARTNER',
  SENIOR_AUDIT_MANAGER: 'SENIOR_AUDIT_MANAGER',
  AUDIT_MANAGER: 'AUDIT_MANAGER',
  EXECUTIVE_MANAGER: 'EXECUTIVE_MANAGER',
  SENIOR_AUDIT_EXECUTIVE: 'SENIOR_AUDIT_EXECUTIVE',
  AUDIT_EXECUTIVE: 'AUDIT_EXECUTIVE',
  HR_MANAGER: 'HR_MANAGER',
  ACCOUNTS_MANAGER: 'ACCOUNTS_MANAGER',
  OFFICE_ADMIN: 'SENIOR_OFFICE_ADMIN',
  OFFICE_ASSISTANT: 'OFFICE_EXECUTIVE',
  INTERN: 'INTERN',
} as const;

export type GradeCode = (typeof GRADE)[keyof typeof GRADE];

/** Management reports / firm-wide QC — Senior Audit Manager and above. */
export function canViewManagementInsights(role: string, hierarchyCode?: string | null): boolean {
  if (role === 'Partner' || role === 'Admin') return true;
  if (role !== 'Manager') return false;
  return (
    !hierarchyCode ||
    hierarchyCode === GRADE.SENIOR_AUDIT_MANAGER ||
    hierarchyCode === GRADE.PARTNER
  );
}

/** Password vault — Partners, Admin, Senior Manager; Audit Managers keep access for client portals. */
export function canAccessVault(role: string, _hierarchyCode?: string | null): boolean {
  return ['Partner', 'Admin', 'Manager'].includes(role);
}

/** First-level workpaper / stage check (Senior Audit Executive+). */
export function canFirstLevelReview(role: string, hierarchyCode?: string | null): boolean {
  if (['Partner', 'Admin', 'Manager'].includes(role)) return true;
  if (role !== 'Staff') return false;
  return hierarchyCode === GRADE.SENIOR_AUDIT_EXECUTIVE;
}

/** Manager review / leave sanction of team. */
export function canManagerReview(role: string): boolean {
  return ['Partner', 'Admin', 'Manager'].includes(role);
}

/** Attest another person's timesheet day. */
export function canAttestTimesheets(role: string, hierarchyCode?: string | null): boolean {
  if (['Partner', 'Admin', 'Manager', 'HR'].includes(role)) return true;
  return role === 'Staff' && hierarchyCode === GRADE.SENIOR_AUDIT_EXECUTIVE;
}

/** Paths Audit Managers should not see (Senior Manager retains). */
export const AUDIT_MANAGER_DENIED_PATHS = ['/management-reports', '/admin/scheduler'] as const;
