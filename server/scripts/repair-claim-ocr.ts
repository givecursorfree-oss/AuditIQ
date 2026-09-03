import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import { runClaimReceiptOcr } from '../src/lib/claimReceiptOcr.js';

async function main() {
  const claims = await prisma.expenseClaim.findMany({
    where: { receipts: { some: {} } },
    select: { id: true },
  });

  for (const c of claims) {
    await runClaimReceiptOcr(c.id);
    console.log('OCR re-run:', c.id);
  }

  console.log(`Done — ${claims.length} claim(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
