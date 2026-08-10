import prisma from './prisma.js';

export type PermissionKey = `${string}:${string}`;

const SYSTEM_ROLES = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern', 'Client'] as const;

export function isPrivilegedRole(role: string): boolean {
  return role === 'Admin' || role === 'Partner';
}

/** Partner, Admin, and Manager — firm-level operational leadership. */
export const FIRM_LEADERSHIP_ROLES = ['Partner', 'Admin', 'Manager'] as const;

export function isFirmLeadershipRole(role: string): boolean {
  return (FIRM_LEADERSHIP_ROLES as readonly string[]).includes(role);
}

export const PARTNER_ADMIN_ROLES = ['Partner', 'Admin'] as const;

export function isPartnerAdminRole(role: string): boolean {
  return (PARTNER_ADMIN_ROLES as readonly string[]).includes(role);
}

/** Link legacy users (role string only) to the matching Role row so permissions resolve. */
export async function ensureUserRoleLinked(userId: string, roleName: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, roleId: true, roleRef: { select: { name: true } } },
  });
  if (!user) return;

  const roleMismatch =
    user.role !== roleName || (user.roleRef != null && user.roleRef.name !== user.role);

  if ((!user.roleId || roleMismatch) && SYSTEM_ROLES.includes(roleName as (typeof SYSTEM_ROLES)[number])) {
    const role = await prisma.role.findFirst({
      where: { name: user.role },
      select: { id: true },
    });
    if (role) {
      await prisma.user.update({
        where: { id: userId },
        data: { roleId: role.id },
      });
    }
  }
}

async function permissionsForRoleName(roleName: string): Promise<PermissionKey[]> {
  const role = await prisma.role.findFirst({
    where: { name: roleName },
    select: {
      permissions: {
        select: {
          permission: { select: { module: true, action: true } },
        },
      },
    },
  });
  const perms = role?.permissions?.map((rp) => rp.permission) ?? [];
  return perms.map((p) => `${p.module}:${p.action}` as PermissionKey);
}

/** Load permission keys as `module:action` for a user (from role in DB — used for sidebar + UI). */
export async function getUserPermissionKeys(
  userId: string,
  roleName: string
): Promise<PermissionKey[]> {
  await ensureUserRoleLinked(userId, roleName);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      roleRef: {
        select: {
          permissions: {
            select: {
              permission: { select: { module: true, action: true } },
            },
          },
        },
      },
    },
  });

  const perms = user?.roleRef?.permissions?.map((rp) => rp.permission) ?? [];
  if (perms.length > 0) {
    return perms.map((p) => `${p.module}:${p.action}` as PermissionKey);
  }

  return permissionsForRoleName(roleName);
}

export function hasPermissionKey(
  keys: PermissionKey[],
  module: string,
  action: string
): boolean {
  if ((keys as string[]).includes('*')) return true;
  return keys.includes(`${module}:${action}`);
}
