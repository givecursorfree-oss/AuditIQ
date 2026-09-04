/**
 * Additive: ensure expenses:* permissions exist and are linked to claim roles.
 * Does NOT wipe other role permissions (safe on every boot).
 *   node scripts/ensure-expenses-permissions.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'apply', 'manage'];

/** role → expenses actions to grant (additive) */
const ROLE_EXPENSES = {
  Admin: ACTIONS,
  Partner: ACTIONS,
  Manager: ['view', 'create', 'edit', 'approve', 'export', 'apply', 'manage'],
  Staff: ['view', 'create', 'edit', 'apply'],
  Intern: ['view', 'create', 'apply'],
  Accounts: ['view', 'create', 'edit', 'export', 'manage'],
};

async function main() {
  const permIds = [];
  for (const action of ACTIONS) {
    const p = await prisma.permission.upsert({
      where: { module_action: { module: 'expenses', action } },
      create: {
        module: 'expenses',
        action,
        description: `${action.charAt(0).toUpperCase() + action.slice(1)} access for expenses`,
      },
      update: {},
    });
    permIds.push(p);
  }

  let linked = 0;
  for (const [roleName, acts] of Object.entries(ROLE_EXPENSES)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      console.warn(`ensure-expenses: role ${roleName} missing — skip`);
      continue;
    }
    for (const p of permIds) {
      if (!acts.includes(p.action)) continue;
      const exists = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
      });
      if (exists) continue;
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: p.id },
      });
      linked += 1;
    }
  }
  console.log(`ensure-expenses: ok (new role links: ${linked})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
