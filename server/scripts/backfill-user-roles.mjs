/**
 * Link users missing roleId to their system Role row (safe to re-run).
 * Usage: node scripts/backfill-user-roles.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ROLES = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern', 'Client'];

async function main() {
  const users = await prisma.user.findMany({
    where: { roleId: null },
    select: { id: true, email: true, role: true },
  });

  if (users.length === 0) {
    console.log('✅ All users already have roleId linked.');
    return;
  }

  const roleByName = Object.fromEntries(
    (await prisma.role.findMany({ select: { id: true, name: true } })).map((r) => [r.name, r.id])
  );

  let linked = 0;
  for (const u of users) {
    const roleId = roleByName[u.role];
    if (!roleId || !ROLES.includes(u.role)) {
      console.warn(`⚠️  Skip ${u.email} — no Role row for "${u.role}"`);
      continue;
    }
    await prisma.user.update({ where: { id: u.id }, data: { roleId } });
    console.log(`✅ Linked ${u.email} → ${u.role}`);
    linked += 1;
  }

  console.log(`\nDone. Linked ${linked} of ${users.length} user(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
