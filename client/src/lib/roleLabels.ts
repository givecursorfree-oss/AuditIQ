import type { User } from '@/types';

/** System role → CA firm professional title (MKD / AuditIQ). */
const ROLE_DISPLAY_NAMES: Record<string, string> = {
  Admin: 'Firm Administrator',
  Partner: 'Partner',
  Manager: 'Audit Manager',
  Staff: 'Audit Executive',
  Intern: 'Intern',
  HR: 'HR Manager',
  Accounts: 'Accounts Manager',
};

/** Human-readable role labels for UI (sidebar, profile, chat, etc.) */
export function formatRoleLabel(role: string): string {
  return ROLE_DISPLAY_NAMES[role] ?? role;
}

/** Prefer article designation, then hierarchy title, then designation, then role label. */
export function formatStaffTitle(user: Pick<User, 'role' | 'designation'> & { hierarchyLevel?: { title: string } | null }): string {
  const des = user.designation?.trim();
  if (des && /article/i.test(des)) return des;
  if (user.hierarchyLevel?.title) return user.hierarchyLevel.title;
  if (des) return des;
  return formatRoleLabel(user.role);
}
