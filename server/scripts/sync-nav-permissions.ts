/**
 * Upsert navigation-related permissions (leave, employees, messages).
 * Safe to run on every deploy / dev prep.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXTRA_MODULES: { module: string; actions: string[] }[] = [
  { module: 'leave', actions: ['view', 'apply', 'manage', 'approve'] },
  { module: 'employees', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'messages', actions: ['view', 'create'] },
];

async function main() {
  for (const { module, actions } of EXTRA_MODULES) {
    for (const action of actions) {
      await prisma.permission.upsert({
        where: { module_action: { module, action } },
        create: {
          module,
          action,
          description: `${action} access for ${module}`,
        },
        update: {},
      });
    }
  }
  console.log('✅ Navigation permissions synced');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
