/**
 * Import MKD staff from Employees list.xlsx (embedded roster).
 * Safe to re-run: upserts by email; refreshes password when MKD_IMPORT_UPDATE_PASSWORD=true (default).
 *
 * Local:
 *   cd server && node scripts/import-mkd-employees.mjs
 *
 * Production (inside API container after git pull + rebuild):
 *   docker compose -f docker-compose.api.yml --env-file .env.api exec -T server node scripts/import-mkd-employees.mjs
 *
 * Env:
 *   MKD_IMPORT_PASSWORD=Welcome@MKD2026   (default)
 *   MKD_IMPORT_UPDATE_PASSWORD=false      skip password reset on existing users
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = process.env.MKD_IMPORT_PASSWORD || 'Welcome@MKD2026';
const UPDATE_PASSWORD = process.env.MKD_IMPORT_UPDATE_PASSWORD !== 'false';
const FIRM_NAME = process.env.BOOTSTRAP_FIRM_NAME || 'M.K. Dandeker & Co LLP';

/** Matches MKD_HIERARCHY in src/lib/workflowCatalog.ts */
const HIERARCHY_LEVELS = [
  { code: 'PARTNER', title: 'Partner', sortOrder: 1, systemRole: 'Partner' },
  { code: 'SENIOR_AUDIT_MANAGER', title: 'Senior Audit Manager', sortOrder: 2, systemRole: 'Manager' },
  { code: 'AUDIT_MANAGER', title: 'Audit Manager', sortOrder: 3, systemRole: 'Manager' },
  { code: 'EXECUTIVE_MANAGER', title: 'Executive Manager', sortOrder: 4, systemRole: 'Manager' },
  { code: 'SENIOR_AUDIT_EXECUTIVE', title: 'Senior Audit Executive', sortOrder: 5, systemRole: 'Staff' },
  { code: 'AUDIT_EXECUTIVE', title: 'Audit Executive (Article)', sortOrder: 6, systemRole: 'Staff' },
  { code: 'HR_MANAGER', title: 'HR Manager', sortOrder: 7, systemRole: 'Staff' },
  { code: 'ACCOUNTS_MANAGER', title: 'Accounts Manager', sortOrder: 8, systemRole: 'Staff' },
  { code: 'SENIOR_OFFICE_ADMIN', title: 'Senior Office Administrator', sortOrder: 9, systemRole: 'Staff' },
  { code: 'OFFICE_EXECUTIVE', title: 'Office Executive', sortOrder: 10, systemRole: 'Staff' },
  { code: 'INTERN', title: 'Intern', sortOrder: 11, systemRole: 'Intern' },
];

/** Roster from Employees list.xlsx — sheet roles mapped to systemRole + hierarchyCode */
const STAFF = [
  // Partners
  { name: 'Poosaidurai', email: 'poosaidurai@mkdandeker.com', phone: '9843693466', systemRole: 'Partner', hierarchyCode: 'PARTNER', designation: 'Partner' },
  { name: 'Arun Mehta', email: 'arunmehta@mkdandeker.com', phone: '9677275969', systemRole: 'Partner', hierarchyCode: 'PARTNER', designation: 'Partner' },
  { name: 'Deepika Thangaraj', email: 'deepikat@mkdandeker.com', phone: '9976604885', systemRole: 'Partner', hierarchyCode: 'PARTNER', designation: 'Partner' },
  { name: 'Nirmal P', email: 'nirmal@mkdandeker.com', phone: '8668115579', systemRole: 'Partner', hierarchyCode: 'PARTNER', designation: 'Partner' },
  { name: 'Anand Gupta', email: 'anandgupta@mkdandeker.com', phone: '9094382032', systemRole: 'Partner', hierarchyCode: 'PARTNER', designation: 'Partner' },
  // Managers
  { name: 'Shanmugam', email: 'shanmugam@mkdandeker.com', phone: '9444912821', systemRole: 'Manager', hierarchyCode: 'SENIOR_AUDIT_MANAGER', designation: 'Senior Audit Manager' },
  { name: 'Pragadisan M', email: 'pragadisan@mkdandeker.com', phone: '8148467388', systemRole: 'Manager', hierarchyCode: 'AUDIT_MANAGER', designation: 'Audit Manager' },
  { name: 'Nagajyothi M', email: 'nagajyothi@mkdandeker.com', phone: '9791638705', systemRole: 'Manager', hierarchyCode: 'AUDIT_MANAGER', designation: 'Audit Manager' },
  { name: 'Gopinath G P', email: 'gopinathgp@mkdandeker.com', phone: '8056737818', systemRole: 'Manager', hierarchyCode: 'AUDIT_MANAGER', designation: 'Audit Manager' },
  { name: 'Naveen Kumar Merugu', email: 'naveenm@mkdandeker.com', phone: '8686159936', systemRole: 'Manager', hierarchyCode: 'AUDIT_MANAGER', designation: 'Audit Manager' },
  // Senior audit executives
  { name: 'Rishika Ranka', email: 'rishikam@mkdandeker.com', phone: '9080584856', systemRole: 'Staff', hierarchyCode: 'SENIOR_AUDIT_EXECUTIVE', designation: 'Senior Audit Executive' },
  { name: 'Senthil Kumar C', email: 'senthilkumar@mkdandeker.com', phone: '9789619670', systemRole: 'Staff', hierarchyCode: 'SENIOR_AUDIT_EXECUTIVE', designation: 'Senior Audit Executive' },
  // Audit executives
  { name: 'Archana M', email: 'archana@mkdandeker.com', phone: '7845816619', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Hari Shankar', email: 'harishankar@mkdandeker.com', phone: '9791716206', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Darshna Lalwani', email: 'darshna2025@mkdandeker.com', phone: '9043317292', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Laksha N', email: 'laksha@mkdandeker.com', phone: '9445628664', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Pakshal Solanki', email: 'pakshal@mkdandeker.com', phone: '8825586360', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Kamakshi B', email: 'kamakshi@mkdandeker.com', phone: '6303384638', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Mohamed Javed Afsar N', email: 'javed@mkdandeker.com', phone: '9791006639', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Dhanush Srinivasan', email: 'dhanush@mkdandeker.com', phone: '7639370886', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Jinay Jain', email: 'jinay@mkdandeker.com', phone: '9884184417', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Isha Jain', email: 'isha@mkdandeker.com', phone: '8072027312', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Bhavik Doshi', email: 'bhavik@mkdandeker.com', phone: '8015566965', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Venkatesh G', email: 'venkateshg@mkdandeker.com', phone: '6383921039', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Kamalesh P', email: 'kamalesh@mkdandeker.com', phone: '9994545344', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Divya I', email: 'divya@mkdandeker.com', phone: '9840588350', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Srinath R D', email: 'srinath@mkdandeker.com', phone: '9884880228', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Laksh D', email: 'lakshd@mkdandeker.com', phone: '7395903275', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Karan R', email: 'karan@mkdandeker.com', phone: '7339081788', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Dhanalakshmi S', email: 'dhanalakshmi@mkdandeker.com', phone: '8248294272', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Anuj Mundra', email: 'anujmundra@mkdandeker.com', phone: '8248206198', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Harsh Kothari', email: 'harshkothari@mkdandeker.com', phone: '7010054146', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Saakshi Jain', email: 'saakshi@mkdandeker.com', phone: '7788009255', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Sathish Kumar M', email: 'sathishm@mkdandeker.com', phone: '7305876376', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Khushi Kela', email: 'khushi@mkdandeker.com', phone: '9043297516', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Jahnavi Ramesh', email: 'jahnavi@mkdandeker.com', phone: '8220444513', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'ArunKumar V', email: 'arunkumarv@mkdandeker.com', phone: '9003174024', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Aparna S K', email: 'aparnask@mkdandeker.com', phone: '7338877360', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Dhivya Priya B', email: 'dhivyapriya@mkdandeker.com', phone: '7904521218', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Nirranjan M', email: 'nirranjan@mkdandeker.com', phone: '9444331112', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  { name: 'Meeth Sooda P', email: 'meeth@mkdandeker.com', phone: '8072912515', systemRole: 'Staff', hierarchyCode: 'AUDIT_EXECUTIVE', designation: 'Audit Executive (Article)' },
  // Support — HR/Accounts use dedicated system roles
  { name: 'Kalpana', email: 'accounts@mkdandeker.com', phone: '9962595590', systemRole: 'Accounts', hierarchyCode: 'ACCOUNTS_MANAGER', designation: 'Accounts Manager' },
  { name: 'Dhara Vijayakumar', email: 'dhara@mkdandeker.com', phone: '9884939884', systemRole: 'HR', hierarchyCode: 'HR_MANAGER', designation: 'HR Manager' },
  // Sheet had no email — placeholder until you update in Settings
  { name: 'Mahalingam', email: 'mahalingam@mkdandeker.com', phone: '9282104681', systemRole: 'Staff', hierarchyCode: 'SENIOR_OFFICE_ADMIN', designation: 'Senior Office Administrator', note: 'placeholder email' },
  { name: 'Ravi', email: 'ravi.office@mkdandeker.com', phone: '9176273533', systemRole: 'Staff', hierarchyCode: 'OFFICE_EXECUTIVE', designation: 'Office Executive', note: 'placeholder email' },
];

function cleanPhone(raw) {
  return String(raw ?? '')
    .replace(/\u00a0/g, '')
    .replace(/\D/g, '')
    .slice(0, 15);
}

function parseName(full) {
  const trimmed = full.trim().replace(/\s+/g, ' ');
  const parts = trimmed.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '', initials: parts[0].slice(0, 2).toUpperCase() };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? firstName[1] ?? ''}`.toUpperCase();
  return { firstName, lastName, initials };
}

async function ensureHierarchy() {
  for (const level of HIERARCHY_LEVELS) {
    await prisma.hierarchyLevel.upsert({
      where: { code: level.code },
      create: level,
      update: { title: level.title, sortOrder: level.sortOrder, systemRole: level.systemRole },
    });
  }
  const rows = await prisma.hierarchyLevel.findMany();
  return Object.fromEntries(rows.map((r) => [r.code, r.id]));
}

async function main() {
  if (PASSWORD.length < 8) throw new Error('MKD_IMPORT_PASSWORD must be at least 8 characters');

  let firm = await prisma.firm.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!firm) {
    firm = await prisma.firm.create({
      data: { name: FIRM_NAME, city: 'Mumbai', state: 'Maharashtra' },
    });
    console.log(`Created firm: ${firm.name}`);
  }

  const hierarchyByCode = await ensureHierarchy();
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const roleByName = Object.fromEntries(roles.map((r) => [r.name, r.id]));
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  let created = 0;
  let updated = 0;
  const samples = [];

  for (const row of STAFF) {
    const email = row.email.trim().toLowerCase();
    const { firstName, lastName, initials } = parseName(row.name);
    const roleId = roleByName[row.systemRole];
    if (!roleId) {
      console.warn(`Skip ${email}: missing Role "${row.systemRole}" — run node scripts/repair-role-permissions.mjs first`);
      continue;
    }
    const hierarchyLevelId = hierarchyByCode[row.hierarchyCode] ?? null;
    const phone = cleanPhone(row.phone) || null;

    const base = {
      firstName,
      lastName,
      initials,
      role: row.systemRole,
      roleId,
      hierarchyLevelId,
      designation: row.designation,
      phone,
      firmId: firm.id,
      emailVerified: true,
      isActive: true,
    };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...base,
          ...(UPDATE_PASSWORD ? { passwordHash } : {}),
        },
      });
      updated += 1;
      if (samples.length < 6) samples.push({ email, role: row.systemRole, action: 'updated' });
    } else {
      await prisma.user.create({
        data: { email, passwordHash, ...base },
      });
      created += 1;
      if (samples.length < 6) samples.push({ email, role: row.systemRole, action: 'created' });
    }
    if (row.note) console.log(`  note: ${row.name} — ${row.note}`);
  }

  console.log(`\nDone: ${created} created, ${updated} updated (${STAFF.length} in roster).`);
  console.log(`Temp password for all imported/updated users: ${PASSWORD}`);
  console.log('\nSample logins:');
  for (const s of samples) {
    console.log(`  ${s.role.padEnd(8)} ${s.email} (${s.action})`);
  }
  console.log('\nOptional: node scripts/repair-role-permissions.mjs');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
