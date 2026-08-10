/**
 * One-shot production bootstrap: create/update the firm admin account.
 * Does NOT wipe data. Safe to re-run.
 *
 *   BOOTSTRAP_ADMIN_EMAIL=admin@mkdandeker.com \
 *   BOOTSTRAP_ADMIN_PASSWORD='Admin@123' \
 *   npx tsx prisma/bootstrap-admin.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const EMAIL = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@mkdandeker.com').trim().toLowerCase();
const PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@123';
const FIRM_NAME = process.env.BOOTSTRAP_FIRM_NAME || 'M.K. Dandeker & Co LLP';

async function main() {
  if (PASSWORD.length < 8) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters');
  }

  let firm = await prisma.firm.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!firm) {
    firm = await prisma.firm.create({
      data: { name: FIRM_NAME, city: 'Mumbai', state: 'Maharashtra' },
    });
    console.log(`Created firm: ${firm.name}`);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: 'Admin',
        firstName: existing.firstName || 'System',
        lastName: existing.lastName || 'Admin',
        designation: existing.designation || 'Firm Administrator',
        firmId: existing.firmId || firm.id,
        emailVerified: true,
        isActive: true,
      },
    });
    console.log(`Updated admin: ${EMAIL}`);
  } else {
    await prisma.user.create({
      data: {
        email: EMAIL,
        passwordHash,
        firstName: 'System',
        lastName: 'Admin',
        initials: 'SA',
        role: 'Admin',
        designation: 'Firm Administrator',
        firmId: firm.id,
        emailVerified: true,
        isActive: true,
      },
    });
    console.log(`Created admin: ${EMAIL}`);
  }

  console.log('Login with that email and the bootstrap password.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
