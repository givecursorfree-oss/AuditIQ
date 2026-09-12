/** Mirror of client formatStaffTitle — prefer article designation over hierarchy title. */
const ROLE_DISPLAY_NAMES: Record<string, string> = {
  Admin: 'Firm Administrator',
  Partner: 'Partner',
  Manager: 'Audit Manager',
  Staff: 'Audit Executive',
  Intern: 'Intern',
  HR: 'HR Manager',
  Accounts: 'Accounts Manager',
};

export type StaffTitleUser = {
  role: string;
  designation?: string | null;
  hierarchyLevel?: { title: string } | null;
};

export function formatStaffTitle(user: StaffTitleUser): string {
  const des = user.designation?.trim();
  if (des && /article/i.test(des)) return des;
  if (user.hierarchyLevel?.title) return user.hierarchyLevel.title;
  if (des) return des;
  return ROLE_DISPLAY_NAMES[user.role] ?? user.role;
}
