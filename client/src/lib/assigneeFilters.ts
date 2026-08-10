/** MKD hierarchy slots for engagement team assignment (UI filtering). */

const PARTNER_SLOT_CODES = ['PARTNER', 'SENIOR_AUDIT_MANAGER'] as const;
const MANAGER_SLOT_CODES = [
  'PARTNER',
  'SENIOR_AUDIT_MANAGER',
  'AUDIT_MANAGER',
  'EXECUTIVE_MANAGER',
] as const;
const ARTICLE_SLOT_CODES = ['SENIOR_AUDIT_EXECUTIVE', 'AUDIT_EXECUTIVE', 'INTERN'] as const;

type AssigneeSlot = 'partner' | 'manager' | 'article';

interface AssignableUser {
  id: string;
  role?: string;
  hierarchyLevel?: { code: string } | null;
  hierarchyLevelCode?: string | null;
}

function hierarchyCode(user: AssignableUser): string | undefined {
  return user.hierarchyLevel?.code ?? user.hierarchyLevelCode ?? undefined;
}

function roleFallback(slot: AssigneeSlot, role: string): boolean {
  if (slot === 'partner') return role === 'Partner' || role === 'Admin';
  if (slot === 'manager') return ['Partner', 'Admin', 'Manager'].includes(role);
  return ['Staff', 'Intern'].includes(role);
}

function userFitsAssigneeSlot(user: AssignableUser, slot: AssigneeSlot): boolean {
  const code = hierarchyCode(user);
  const allowed =
    slot === 'partner'
      ? PARTNER_SLOT_CODES
      : slot === 'manager'
        ? MANAGER_SLOT_CODES
        : ARTICLE_SLOT_CODES;
  if (code) return (allowed as readonly string[]).includes(code);
  return roleFallback(slot, user.role ?? 'Staff');
}

export function filterUsersForSlot<T extends AssignableUser>(users: T[], slot: AssigneeSlot): T[] {
  return users.filter((u) => userFitsAssigneeSlot(u, slot));
}
