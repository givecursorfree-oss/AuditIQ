import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import { repairMissingClaimManagerApprovals } from '../src/lib/claimGroupApproval.js';

const REPORTS_TO_BY_EMAIL: Record<string, string> = {
  'intern@mkd.co': 'manager@mkd.co',
  'executive@mkd.co': 'manager@mkd.co',
  'senior.exec@mkd.co': 'senior.manager@mkd.co',
};

async function syncMkdReportsTo() {
  const users = await prisma.user.findMany({
    where: { email: { in: [...Object.keys(REPORTS_TO_BY_EMAIL), ...Object.values(REPORTS_TO_BY_EMAIL)] } },
    select: { id: true, email: true },
  });
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u.id]));
  for (const [email, managerEmail] of Object.entries(REPORTS_TO_BY_EMAIL)) {
    const userId = byEmail[email];
    const managerId = byEmail[managerEmail];
    if (userId && managerId) {
      await prisma.user.update({ where: { id: userId }, data: { reportsToId: managerId } });
    }
  }
}

async function main() {
  await syncMkdReportsTo();
  const fixed = await repairMissingClaimManagerApprovals();
  console.log(`✅ Repaired ${fixed} claim manager approval row(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
