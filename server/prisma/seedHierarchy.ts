import type { PrismaClient } from '@prisma/client';
import { MKD_HIERARCHY } from '../src/lib/workflowCatalog.js';

const ROLE_DISPLAY: Record<string, { description: string }> = {
  Partner: { description: 'Partner — final sign-off and firm leadership' },
  Manager: { description: 'Audit Manager — review, supervision, and client coordination' },
  Staff: { description: 'Audit Executive — execution and article assignments' },
  Intern: { description: 'Intern — supervised support assignments' },
  Admin: { description: 'Firm Administrator — system and user administration' },
  Client: { description: 'Client portal access' },
  HR: { description: 'HR & Admin Manager — attendance, leave, and people administration' },
  Accounts: { description: 'Accounts Manager — billing and invoicing' },
};

/** MKD test account email → hierarchy level code (set during db:reset). */
export const MKD_USER_HIERARCHY_BY_EMAIL: Record<string, string> = {
  'admin@mkd.co': 'PARTNER',
  'partner@mkd.co': 'PARTNER',
  'senior.manager@mkd.co': 'SENIOR_AUDIT_MANAGER',
  'manager@mkd.co': 'AUDIT_MANAGER',
  'executive@mkd.co': 'AUDIT_EXECUTIVE',
  'senior.exec@mkd.co': 'SENIOR_AUDIT_EXECUTIVE',
  'hr@mkd.co': 'HR_MANAGER',
  'accounts@mkd.co': 'ACCOUNTS_MANAGER',
  'office@mkd.co': 'SENIOR_OFFICE_ADMIN',
  'intern@mkd.co': 'INTERN',
};

export async function seedHierarchyAndRoles(prisma: PrismaClient) {
  for (const level of MKD_HIERARCHY) {
    await prisma.hierarchyLevel.upsert({
      where: { code: level.code },
      create: {
        code: level.code,
        title: level.title,
        sortOrder: level.sortOrder,
        systemRole: level.systemRole,
      },
      update: {
        title: level.title,
        sortOrder: level.sortOrder,
        systemRole: level.systemRole,
      },
    });
  }

  for (const [name, meta] of Object.entries(ROLE_DISPLAY)) {
    await prisma.role.updateMany({
      where: { name },
      data: { description: meta.description },
    });
  }

  const levels = await prisma.hierarchyLevel.findMany();
  const byCode = Object.fromEntries(levels.map((l) => [l.code, l.id]));

  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
  for (const u of users) {
    if (u.role === 'Client') {
      await prisma.user.update({
        where: { id: u.id },
        data: { hierarchyLevelId: null },
      });
      continue;
    }
    const code = MKD_USER_HIERARCHY_BY_EMAIL[u.email] ?? fallbackHierarchyForRole(u.role);
    const levelId = code ? byCode[code] : null;
    if (levelId) {
      await prisma.user.update({
        where: { id: u.id },
        data: { hierarchyLevelId: levelId },
      });
    }
  }
}

function fallbackHierarchyForRole(role: string): string | undefined {
  const map: Record<string, string> = {
    Partner: 'PARTNER',
    Manager: 'AUDIT_MANAGER',
    Staff: 'AUDIT_EXECUTIVE',
    Intern: 'INTERN',
    Admin: 'PARTNER',
    HR: 'HR_MANAGER',
    Accounts: 'ACCOUNTS_MANAGER',
  };
  return map[role];
}
