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

/** Prefer hierarchy title from API, then designation, then role label. */
export function formatStaffTitle(user: Pick<User, 'role' | 'designation'> & { hierarchyLevel?: { title: string } | null }): string {
  if (user.hierarchyLevel?.title) return user.hierarchyLevel.title;
  if (user.designation?.trim()) return user.designation.trim();
  return formatRoleLabel(user.role);
}
