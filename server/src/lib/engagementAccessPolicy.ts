import type { Prisma } from '@prisma/client';

/** MKD grades with firm-wide engagement visibility (per office hierarchy sheet). */
export const FIRM_WIDE_HIERARCHY_CODES = new Set(['PARTNER', 'SENIOR_AUDIT_MANAGER']);

/** HR sees all engagements read-only for workflow/attendance oversight. */
export const HR_HIERARCHY_CODE = 'HR_MANAGER';

export const ACCOUNTS_HIERARCHY_CODE = 'ACCOUNTS_MANAGER';

export type EngagementAccessProfile = {
  userId: string;
  role: string;
  firmId: string | null;
  hierarchyCode: string | null;
  reportsToId: string | null;
};

export function hasFirmWideEngagementAccess(role: string, hierarchyCode?: string | null): boolean {
  if (role === 'Partner' || role === 'Admin') return true;
  if (hierarchyCode && FIRM_WIDE_HIERARCHY_CODES.has(hierarchyCode)) return true;
  if (role === 'HR' && hierarchyCode === HR_HIERARCHY_CODE) return true;
  return false;
}

export function isAccountsManager(role: string, hierarchyCode?: string | null): boolean {
  return role === 'Accounts' || hierarchyCode === ACCOUNTS_HIERARCHY_CODE;
}

export function isInternRole(role: string, hierarchyCode?: string | null): boolean {
  return role === 'Intern' || hierarchyCode === 'INTERN';
}

/** Engagements a user is directly tied to (team, legacy IDs, or tasks). */
export function assignedEngagementWhere(userId: string, firmId: string): Prisma.EngagementWhereInput {
  return {
    firmId,
    OR: [
      { members: { some: { userId } } },
      { partnerInChargeId: userId },
      { managerId: userId },
      { articleAssistantId: userId },
      { tasks: { some: { OR: [{ assigneeId: userId }, { createdById: userId }] } } },
    ],
  };
}

/** Accounts: billing stage or filed-but-not-yet-billed. */
export function accountsEngagementWhere(firmId: string): Prisma.EngagementWhereInput {
  return {
    firmId,
    OR: [
      { currentStage: { in: ['Billing', 'BILLING'] } },
      {
        filedAt: { not: null },
        archivedAt: null,
        currentStage: { notIn: ['Billing', 'BILLING'] },
      },
    ],
  };
}

/** Intern: supervisor's engagements plus direct assignment. */
export function internEngagementWhere(
  userId: string,
  firmId: string,
  supervisorId: string | null
): Prisma.EngagementWhereInput {
  if (!supervisorId) {
    return assignedEngagementWhere(userId, firmId);
  }
  return {
    firmId,
    OR: [
      ...(assignedEngagementWhere(userId, firmId).OR as Prisma.EngagementWhereInput[]),
      ...(assignedEngagementWhere(supervisorId, firmId).OR as Prisma.EngagementWhereInput[]),
    ],
  };
}

export function engagementAccessWhereForProfile(profile: EngagementAccessProfile): Prisma.EngagementWhereInput {
  const { userId, role, firmId, hierarchyCode, reportsToId } = profile;
  if (!firmId) return { id: { in: [] } };

  if (hasFirmWideEngagementAccess(role, hierarchyCode)) {
    return { firmId };
  }

  if (isAccountsManager(role, hierarchyCode)) {
    return accountsEngagementWhere(firmId);
  }

  if (isInternRole(role, hierarchyCode)) {
    return internEngagementWhere(userId, firmId, reportsToId);
  }

  return assignedEngagementWhere(userId, firmId);
}
