/**
 * Comp-off policy (HR): Article assistants who work Sundays or firm holidays
 * request approval → Manager/Partner → HR cross-verify → leave credit.
 */

export const COMP_OFF_PENDING = 'Pending';
export const COMP_OFF_MANAGER_APPROVED = 'ManagerApproved';
export const COMP_OFF_HR_CREDITED = 'HrCredited';
export const COMP_OFF_REJECTED = 'Rejected';

export const COMP_OFF_MANAGER_ROLES = ['Partner', 'Admin', 'Manager'] as const;
export const COMP_OFF_HR_ROLES = ['Partner', 'Admin', 'HR'] as const;

export function canManagerApproveCompOff(role: string): boolean {
  return (COMP_OFF_MANAGER_ROLES as readonly string[]).includes(role);
}

export function canHrCreditCompOff(role: string): boolean {
  return (COMP_OFF_HR_ROLES as readonly string[]).includes(role);
}

/** Default credit days for one Sunday/holiday worked. */
export const DEFAULT_COMP_OFF_DAYS = 1;
