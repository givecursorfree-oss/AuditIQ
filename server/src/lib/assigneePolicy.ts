/** MKD hierarchy validation for engagement team assignment. */

export const PARTNER_SLOT_CODES = ['PARTNER', 'SENIOR_AUDIT_MANAGER'] as const;
export const MANAGER_SLOT_CODES = [
  'PARTNER',
  'SENIOR_AUDIT_MANAGER',
  'AUDIT_MANAGER',
  'EXECUTIVE_MANAGER',
] as const;
export const ARTICLE_SLOT_CODES = ['SENIOR_AUDIT_EXECUTIVE', 'AUDIT_EXECUTIVE', 'INTERN'] as const;

export type AssigneeSlot = 'partner' | 'manager' | 'article';

export type AssigneeUser = {
  id: string;
  role: string;
  hierarchyLevel?: { code: string } | null;
};

function roleFallback(slot: AssigneeSlot, role: string): boolean {
  if (slot === 'partner') return role === 'Partner' || role === 'Admin';
  if (slot === 'manager') return ['Partner', 'Admin', 'Manager'].includes(role);
  return ['Staff', 'Intern'].includes(role);
}

export function userFitsAssigneeSlot(user: AssigneeUser, slot: AssigneeSlot): boolean {
  const code = user.hierarchyLevel?.code;
  const allowed =
    slot === 'partner'
      ? PARTNER_SLOT_CODES
      : slot === 'manager'
        ? MANAGER_SLOT_CODES
        : ARTICLE_SLOT_CODES;
  if (code) return (allowed as readonly string[]).includes(code);
  return roleFallback(slot, user.role);
}

export function validateResourceAssignees(
  users: AssigneeUser[],
  fields: {
    partnerInChargeId?: string | null;
    managerId?: string | null;
    articleAssistantId?: string | null;
  }
): { valid: boolean; error?: string } {
  const byId = new Map(users.map((u) => [u.id, u]));
  const checks: Array<[AssigneeSlot, string | null | undefined, string]> = [
    ['partner', fields.partnerInChargeId, 'Partner-in-Charge'],
    ['manager', fields.managerId, 'Manager / Reviewer'],
    ['article', fields.articleAssistantId, 'Article Assistant'],
  ];
  for (const [slot, id, label] of checks) {
    if (!id) continue;
    const user = byId.get(id);
    if (!user) continue;
    if (!userFitsAssigneeSlot(user, slot)) {
      return {
        valid: false,
        error: `${label} must be a valid MKD hierarchy role for that slot`,
      };
    }
  }
  return { valid: true };
}
