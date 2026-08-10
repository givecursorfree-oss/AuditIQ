/**
 * Production repair (no tsx). Creates Role rows + permissions + links users.
 *   node scripts/repair-role-permissions.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MODULES = [
  'dashboard', 'engagements', 'workpapers', 'documents', 'reports', 'attendance',
  'leave', 'employees', 'messages', 'settings', 'clients', 'invoices', 'vault', 'approvals',
];
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'apply', 'manage'];

const ROLE_META = {
  Admin: 'Firm administrator — sanctions leave; cannot apply leave',
  Partner: 'Senior partner with full audit oversight',
  Manager: 'Audit manager with review and approval rights',
  Staff: 'Audit staff with standard access',
  Intern: 'Intern with limited view-only access',
  Client: 'External client portal access',
  HR: 'HR Manager — attendance and leave administration',
  Accounts: 'Accounts Manager — billing and invoicing',
};

async function ensureAllPermissions() {
  for (const mod of MODULES) {
    for (const action of ACTIONS) {
      await prisma.permission.upsert({
        where: { module_action: { module: mod, action } },
        create: {
          module: mod,
          action,
          description: `${action.charAt(0).toUpperCase() + action.slice(1)} access for ${mod}`,
        },
        update: {},
      });
    }
  }
  return prisma.permission.findMany();
}

async function setRolePermissions(roleName, permissionIds) {
  const description = ROLE_META[roleName] || roleName;
  const role = await prisma.role.upsert({
    where: { name: roleName },
    create: { name: roleName, description, isSystem: true },
    update: { description, isSystem: true },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  if (permissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
    });
  }
  console.log(`OK ${roleName}: ${permissionIds.length} permission(s)`);
}

function pick(all, mods, acts) {
  return all.filter((p) => mods.includes(p.module) && acts.includes(p.action)).map((p) => p.id);
}

async function syncUserRoleIds() {
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const roleByName = Object.fromEntries(roles.map((r) => [r.name, r.id]));
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, roleId: true, roleRef: { select: { name: true } } },
  });
  let fixed = 0;
  for (const u of users) {
    const expectedId = roleByName[u.role];
    if (!expectedId) {
      console.warn(`No Role for ${u.email} (role=${u.role})`);
      continue;
    }
    if (u.roleId !== expectedId || u.roleRef?.name !== u.role) {
      await prisma.user.update({ where: { id: u.id }, data: { roleId: expectedId } });
      console.log(`Linked ${u.email} → ${u.role}`);
      fixed += 1;
    }
  }
  if (fixed === 0) console.log('All users already linked');
}

async function main() {
  const allPerms = await ensureAllPermissions();
  const allIds = allPerms.map((p) => p.id);
  await setRolePermissions(
    'Admin',
    allPerms.filter((p) => !(p.module === 'leave' && p.action === 'apply')).map((p) => p.id)
  );
  await setRolePermissions('Partner', allIds);
  await setRolePermissions(
    'Manager',
    pick(allPerms, MODULES.filter((m) => m !== 'settings'), [
      'view', 'create', 'edit', 'approve', 'export', 'apply', 'manage',
    ])
  );
  await setRolePermissions(
    'Staff',
    pick(allPerms, ['dashboard', 'engagements', 'workpapers', 'documents', 'reports', 'attendance', 'leave', 'messages'], [
      'view', 'create', 'edit', 'apply',
    ])
  );
  await setRolePermissions(
    'Intern',
    pick(allPerms, ['dashboard', 'engagements', 'workpapers', 'documents', 'attendance', 'leave', 'messages'], [
      'view', 'apply',
    ])
  );
  await setRolePermissions('Client', pick(allPerms, ['dashboard', 'documents', 'reports', 'messages'], ['view']));
  await setRolePermissions(
    'HR',
    pick(allPerms, ['dashboard', 'attendance', 'leave', 'employees', 'messages'], [
      'view', 'manage', 'export', 'apply',
    ])
  );
  await setRolePermissions(
    'Accounts',
    pick(allPerms, ['dashboard', 'invoices', 'attendance', 'messages'], ['view', 'create', 'edit', 'export'])
  );
  await syncUserRoleIds();
  console.log('Role permission repair complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
