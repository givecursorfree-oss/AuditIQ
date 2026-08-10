import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { clearDatabase } from './clear-database.js';
import { seedHierarchyAndRoles } from './seedHierarchy.js';
import { seedDocumentTemplates } from '../src/lib/documentTemplateSeed.js';

const prisma = new PrismaClient();

const TEST_PASSWORD = 'Admin@123';

async function main() {
  const force =
    process.argv.includes('--force') ||
    process.env.CONFIRM_DB_RESET === 'true' ||
    process.env.CONFIRM_DB_RESET === '1';

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0 && !force) {
    console.error(`\n❌ Refusing to wipe database: ${existingUsers} user account(s) exist.\n`);
    console.error('   Credentials and firm data are stored permanently until you explicitly reset.');
    console.error('   To wipe ALL data (dev/E2E only), run:');
    console.error('     npm run db:reset:force');
    console.error('   or: CONFIRM_DB_RESET=true npm run db:reset\n');
    process.exit(1);
  }

  if (existingUsers > 0) {
    console.log(`⚠️  Wiping ${existingUsers} user account(s) and all firm data...\n`);
  }

  console.log('🧹 Clearing database...\n');
  await clearDatabase(prisma);

  const modules = ['dashboard', 'engagements', 'workpapers', 'documents', 'reports', 'attendance', 'leave', 'employees', 'messages', 'settings', 'clients', 'invoices', 'vault', 'approvals'];
  const actions = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'apply', 'manage'];
  const permissionData: { module: string; action: string; description: string }[] = [];
  for (const mod of modules) {
    for (const act of actions) {
      permissionData.push({
        module: mod,
        action: act,
        description: `${act.charAt(0).toUpperCase() + act.slice(1)} access for ${mod}`,
      });
    }
  }
  await prisma.permission.createMany({ data: permissionData });
  const allPerms = await prisma.permission.findMany();

  const getPermIds = (mods: string[], acts: string[]) =>
    allPerms.filter((p) => mods.includes(p.module) && acts.includes(p.action)).map((p) => p.id);

  const adminRole = await prisma.role.create({
    data: {
      name: 'Admin',
      description: 'Firm administrator — sanctions leave; cannot apply leave',
      isSystem: true,
      permissions: {
        create: allPerms
          .filter((p) => !(p.module === 'leave' && p.action === 'apply'))
          .map((p) => ({ permissionId: p.id })),
      },
    },
  });

  const partnerRole = await prisma.role.create({
    data: {
      name: 'Partner',
      description: 'Senior partner with full audit oversight',
      isSystem: true,
      permissions: { create: allPerms.map((p) => ({ permissionId: p.id })) },
    },
  });

  const managerRole = await prisma.role.create({
    data: {
      name: 'Manager',
      description: 'Audit manager with review and approval rights',
      isSystem: true,
      permissions: {
        create: getPermIds(
          ['dashboard', 'engagements', 'workpapers', 'documents', 'reports', 'attendance', 'leave', 'employees', 'messages', 'clients', 'invoices', 'vault', 'approvals'],
          ['view', 'create', 'edit', 'approve', 'export', 'apply', 'manage']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  const staffRole = await prisma.role.create({
    data: {
      name: 'Staff',
      description: 'Audit staff with standard access',
      isSystem: true,
      permissions: {
        create: getPermIds(
          ['dashboard', 'engagements', 'workpapers', 'documents', 'reports', 'attendance', 'leave', 'messages'],
          ['view', 'create', 'edit', 'apply']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  const internRole = await prisma.role.create({
    data: {
      name: 'Intern',
      description: 'Intern with limited view-only access',
      isSystem: false,
      permissions: {
        create: getPermIds(
          ['dashboard', 'engagements', 'workpapers', 'documents', 'attendance', 'leave', 'messages'],
          ['view', 'apply']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  const clientRole = await prisma.role.create({
    data: {
      name: 'Client',
      description: 'External client portal access',
      isSystem: true,
      permissions: {
        create: getPermIds(['dashboard', 'documents', 'reports', 'messages'], ['view']).map((pid) => ({
          permissionId: pid,
        })),
      },
    },
  });

  const hrRole = await prisma.role.create({
    data: {
      name: 'HR',
      description: 'HR Manager — attendance and leave administration',
      isSystem: true,
      permissions: {
        create: getPermIds(
          ['dashboard', 'attendance', 'leave', 'employees', 'messages'],
          ['view', 'manage', 'export', 'apply']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  const accountsRole = await prisma.role.create({
    data: {
      name: 'Accounts',
      description: 'Accounts Manager — billing and invoicing',
      isSystem: true,
      permissions: {
        create: getPermIds(
          ['dashboard', 'invoices', 'attendance', 'messages'],
          ['view', 'create', 'edit', 'export']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  console.log('✅ Roles: Admin, Partner, Manager, Staff, Intern, Client, HR, Accounts');

  const firm = await prisma.firm.create({
    data: {
      name: 'M.K. Dandeker & Co LLP',
      city: 'Mumbai',
      state: 'Maharashtra',
    },
  });

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  const roleByName = {
    Admin: adminRole.id,
    Partner: partnerRole.id,
    Manager: managerRole.id,
    Staff: staffRole.id,
    Intern: internRole.id,
    Client: clientRole.id,
    HR: hrRole.id,
    Accounts: accountsRole.id,
  } as const;

  /** MKD hierarchy test accounts — password for all: Admin@123 */
  const testUsers = [
    { email: 'admin@mkd.co', firstName: 'System', lastName: 'Admin', role: 'Admin' as const, initials: 'SA', designation: 'Firm Administrator' },
    { email: 'partner@mkd.co', firstName: 'Ravi', lastName: 'Sharma', role: 'Partner' as const, initials: 'RV', designation: 'Partner' },
    { email: 'senior.manager@mkd.co', firstName: 'Suresh', lastName: 'Kulkarni', role: 'Manager' as const, initials: 'SK', designation: 'Senior Audit Manager' },
    { email: 'manager@mkd.co', firstName: 'Priya', lastName: 'Mehta', role: 'Manager' as const, initials: 'PM', designation: 'Audit Manager' },
    { email: 'executive@mkd.co', firstName: 'Ankit', lastName: 'Patel', role: 'Staff' as const, initials: 'AP', designation: 'Audit Executive (Article)' },
    { email: 'senior.exec@mkd.co', firstName: 'Neha', lastName: 'Desai', role: 'Staff' as const, initials: 'ND', designation: 'Senior Audit Executive' },
    { email: 'hr@mkd.co', firstName: 'Kavita', lastName: 'Rao', role: 'HR' as const, initials: 'KR', designation: 'HR Manager' },
    { email: 'accounts@mkd.co', firstName: 'Ravi', lastName: 'Shah', role: 'Accounts' as const, initials: 'RS', designation: 'Accounts Manager' },
    { email: 'office@mkd.co', firstName: 'Pooja', lastName: 'Nair', role: 'Staff' as const, initials: 'PN', designation: 'Senior Office Administrator' },
    { email: 'intern@mkd.co', firstName: 'Rohan', lastName: 'Kumar', role: 'Intern' as const, initials: 'RK', designation: 'Intern' },
    { email: 'client@mkd.co', firstName: 'Sample', lastName: 'Client', role: 'Client' as const, initials: 'SC', designation: 'Client Contact' },
  ];

  for (const u of testUsers) {
    await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        initials: u.initials,
        role: u.role,
        designation: u.designation,
        firmId: firm.id,
        roleId: roleByName[u.role],
        emailVerified: true,
        isActive: true,
      },
    });
  }

  const clientRecord = await prisma.client.create({
    data: {
      name: 'Sample Client Pvt Ltd',
      legalName: 'Sample Client Private Limited',
      pan: 'AAECS1234F',
      category: 'Private Limited',
      contactName: 'Sample Client',
      contactEmail: 'client@mkd.co',
      contactPhone: '9876543210',
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'Active',
      firmId: firm.id,
    },
  });

  const clientUser = await prisma.user.findUnique({ where: { email: 'client@mkd.co' } });
  if (clientUser) {
    await prisma.clientPortalUser.create({
      data: {
        clientId: clientRecord.id,
        userId: clientUser.id,
        email: 'client@mkd.co',
        passwordHash,
        fullName: 'Sample Client Pvt Ltd',
        mobile: '9876543210',
        isActive: true,
      },
    });
  }

  await seedHierarchyAndRoles(prisma);
  const partnerUser = await prisma.user.findUnique({ where: { email: 'partner@mkd.co' } });
  const tplCount = await seedDocumentTemplates(prisma, firm.id, partnerUser?.id);
  console.log(`\n✅ MKD document templates seeded (${tplCount} new)`);
  console.log('\n✅ Test accounts ready (password for all: Admin@123)\n');
  for (const u of testUsers) {
    console.log(`   ${u.role.padEnd(8)} : ${u.email}`);
  }
  console.log('\n   Client portal linked to: Sample Client Pvt Ltd\n');
}

main()
  .catch((e) => {
    console.error('❌ Reset failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
