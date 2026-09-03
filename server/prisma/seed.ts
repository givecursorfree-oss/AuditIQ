import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { clearDatabase } from './clear-database.js';

const prisma = new PrismaClient();

/** Relative dates so RAG deadlines work when you seed today */
const now = new Date();
function addDays(n: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}
function daysAgo(n: number): Date {
  return addDays(-n);
}

/** AES-256-GCM — same key derivation as server/src/lib/vaultCrypto.ts (reads VAULT_ENCRYPTION_KEY from .env) */
function deriveVaultKey(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
  } catch {
    /* fall through */
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}
const SEED_VAULT_KEY = deriveVaultKey(
  process.env.VAULT_ENCRYPTION_KEY || 'auditiq-dev-vault-key-for-seed-only'
);
function encryptForSeed(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SEED_VAULT_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

async function main() {
  if (process.env.SEED_FULL !== 'true') {
    console.log('⚠️  Full demo seed is disabled by default.\n');
    console.log('   Clean test DB :  npm run db:reset   (from server/)');
    console.log('   Full demo data:  SEED_FULL=true npm run db:seed\n');
    process.exit(0);
  }

  console.log('🌱 Seeding AuditIQ database (full demo)...\n');
  await clearDatabase(prisma);

  // ─── Permissions (modules × actions) ───
  const modules = ['dashboard', 'engagements', 'workpapers', 'documents', 'reports', 'attendance', 'leave', 'employees', 'messages', 'settings', 'clients', 'invoices', 'vault', 'approvals', 'expenses'];
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
  console.log(`✅ Permissions: ${allPerms.length} created`);

  // Helper to get permission IDs by modules
  const getPermIds = (mods: string[], acts: string[]) =>
    allPerms.filter((p) => mods.includes(p.module) && acts.includes(p.action)).map((p) => p.id);

  // ─── Roles ───
  const adminRole = await prisma.role.create({
    data: {
      name: 'Admin', description: 'Firm administrator — sanctions leave, manages users; cannot apply leave', isSystem: true,
      permissions: {
        create: allPerms
          .filter((p) => !(p.module === 'leave' && p.action === 'apply'))
          .map((p) => ({ permissionId: p.id })),
      },
    },
  });

  const partnerRole = await prisma.role.create({
    data: {
      name: 'Partner', description: 'Senior partner with full audit oversight', isSystem: true,
      permissions: { create: allPerms.map((p) => ({ permissionId: p.id })) },
    },
  });

  const managerRole = await prisma.role.create({
    data: {
      name: 'Manager', description: 'Audit manager with review and approval rights', isSystem: true,
      permissions: {
        create: getPermIds(
          ['dashboard', 'engagements', 'workpapers', 'documents', 'reports', 'attendance', 'leave', 'employees', 'messages', 'clients', 'invoices', 'vault', 'approvals', 'expenses'],
          ['view', 'create', 'edit', 'approve', 'export', 'apply', 'manage']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  const staffRole = await prisma.role.create({
    data: {
      name: 'Staff', description: 'Audit staff / article clerk with standard access', isSystem: true,
      permissions: {
        create: getPermIds(
          ['dashboard', 'engagements', 'workpapers', 'documents', 'reports', 'attendance', 'leave', 'messages', 'invoices', 'expenses'],
          ['view', 'create', 'edit', 'apply']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  const internRole = await prisma.role.create({
    data: {
      name: 'Intern', description: 'Intern with limited view-only access', isSystem: false,
      permissions: {
        create: getPermIds(
          ['dashboard', 'engagements', 'workpapers', 'documents', 'attendance', 'leave', 'messages', 'expenses'],
          ['view', 'apply', 'create']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  const clientRole = await prisma.role.create({
    data: {
      name: 'Client', description: 'External client with restricted portal access', isSystem: true,
      permissions: {
        create: getPermIds(
          ['dashboard', 'documents', 'reports', 'messages'],
          ['view']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  console.log(`✅ Roles: 6 created (Admin, Partner, Manager, Staff, Intern, Client)`);

  // ─── Firm ───
  const firm = await prisma.firm.create({
    data: {
      name: 'M.K. Dandeker & Co LLP',
      registrationNo: 'FRN-123456W',
      address: '401 Maker Chambers, Nariman Point, Mumbai 400021',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400021',
      phone: '+91-22-40001234',
      email: 'info@sharmaassociates.in',
      gstin: '27AAAFS1234R1ZP',
      pan: 'AAAFS1234R',
    },
  });
  console.log(`✅ Firm: ${firm.name}`);

  // ─── Users (bcrypt 12 rounds per security best practices) ───
  const SALT_ROUNDS = 12;
  const hash = await bcrypt.hash('Admin@123', SALT_ROUNDS);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@auditiq.in', passwordHash: hash,
      firstName: 'Admin', lastName: 'User', role: 'Admin',
      initials: 'AU', designation: 'System Administrator', firmId: firm.id,
      roleId: adminRole.id,
    },
  });

  const partner = await prisma.user.create({
    data: {
      email: 'rajesh@auditiq.in', passwordHash: hash,
      firstName: 'Rajesh', lastName: 'Sharma', role: 'Partner',
      initials: 'RS', designation: 'CA Rajesh Sharma', firmId: firm.id,
      roleId: partnerRole.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'priya@auditiq.in', passwordHash: hash,
      firstName: 'Priya', lastName: 'Mehta', role: 'Manager',
      initials: 'PM', designation: 'Senior Manager', firmId: firm.id,
      roleId: managerRole.id,
    },
  });

  const staff1 = await prisma.user.create({
    data: {
      email: 'ankit@auditiq.in', passwordHash: hash,
      firstName: 'Ankit', lastName: 'Patel', role: 'Staff',
      initials: 'AP', designation: 'Audit Associate', firmId: firm.id,
      roleId: staffRole.id,
    },
  });

  const staff2 = await prisma.user.create({
    data: {
      email: 'neha@auditiq.in', passwordHash: hash,
      firstName: 'Neha', lastName: 'Gupta', role: 'Staff',
      initials: 'NG', designation: 'Article Clerk', firmId: firm.id,
      roleId: staffRole.id,
    },
  });

  // Intern user
  const intern = await prisma.user.create({
    data: {
      email: 'rohan@auditiq.in', passwordHash: hash,
      firstName: 'Rohan', lastName: 'Kumar', role: 'Intern',
      initials: 'RK', designation: 'Intern', firmId: firm.id,
      roleId: internRole.id,
    },
  });

  const clientUser = await prisma.user.create({
    data: {
      email: 'vikram@reliance.in', passwordHash: hash,
      firstName: 'Vikram', lastName: 'Singh', role: 'Client',
      initials: 'VS', firmId: firm.id,
      roleId: clientRole.id,
    },
  });

  console.log(`✅ Users: 7 created (Admin, Partner, Manager, 2 Staff, 1 Intern, 1 Client)`);

  // ─── Clients ───
  const clients = await Promise.all([
    prisma.client.create({
      data: {
        name: 'Reliance Industries Ltd', cin: 'L17110MH1973PLC019786',
        pan: 'AAACR5055K', gstin: '27AAACR5055K1ZP',
        category: 'Public Ltd', industry: 'Conglomerate',
        contactName: 'Vikram Singh', contactEmail: 'vikram@reliance.in',
        contactPhone: '+91-9820011234', turnover: '₹7,92,756 Cr',
        address: 'Maker Chambers IV, Nariman Point, Mumbai',
        city: 'Mumbai', state: 'Maharashtra', firmId: firm.id,
      },
    }),
    prisma.client.create({
      data: {
        name: 'Tata Consultancy Services', cin: 'L22210MH1995PLC084781',
        pan: 'AAACT2727Q', gstin: '27AAACT2727Q1ZP',
        category: 'Public Ltd', industry: 'IT Services',
        contactName: 'Ramesh Iyer', contactEmail: 'ramesh@tcs.com',
        contactPhone: '+91-9821015678', turnover: '₹2,40,883 Cr',
        address: 'TCS House, Ravindra Annexe, Fort, Mumbai',
        city: 'Mumbai', state: 'Maharashtra', firmId: firm.id,
      },
    }),
    prisma.client.create({
      data: {
        name: 'Infosys Limited', cin: 'L85110KA1981PLC013115',
        pan: 'AAACI1195H', gstin: '29AAACI1195H1Z5',
        category: 'Public Ltd', industry: 'IT Services',
        contactName: 'Deepika Nair', contactEmail: 'deepika@infosys.com',
        contactPhone: '+91-8028521234', turnover: '₹1,53,670 Cr',
        address: 'Electronics City, Hosur Road, Bangalore',
        city: 'Bangalore', state: 'Karnataka', firmId: firm.id,
      },
    }),
    prisma.client.create({
      data: {
        name: 'Bharti Airtel Ltd', cin: 'L74899DL1995PLC070609',
        pan: 'AAACB2894G', gstin: '07AAACB2894G1ZG',
        category: 'Public Ltd', industry: 'Telecom',
        contactName: 'Amit Kapoor', contactEmail: 'amit@airtel.in',
        contactPhone: '+91-9899012345', turnover: '₹1,39,144 Cr',
        address: 'Airtel Center, Plot No. 16, Udyog Vihar, Gurgaon',
        city: 'Gurgaon', state: 'Haryana', firmId: firm.id,
      },
    }),
    prisma.client.create({
      data: {
        name: 'Asian Paints Ltd', cin: 'L24220MH1945PLC004598',
        pan: 'AAACA4836P', gstin: '27AAACA4836P1Z8',
        category: 'Public Ltd', industry: 'Manufacturing',
        contactName: 'Sunil Deshmukh', contactEmail: 'sunil@asianpaints.com',
        contactPhone: '+91-9167890123', turnover: '₹34,489 Cr',
        address: '6A, Shantinagar, Santacruz (E), Mumbai',
        city: 'Mumbai', state: 'Maharashtra', firmId: firm.id,
      },
    }),
  ]);

  console.log(`✅ Clients: ${clients.length} created`);

  // ─── Engagements ───
  const eng1 = await prisma.engagement.create({
    data: {
      title: 'Statutory Audit FY 2024-25',
      type: 'Statutory', financialYear: '2024-25', status: 'Fieldwork',
      progress: 55,
      startDate: new Date('2025-04-01'), deadline: new Date('2025-09-30'),
      billingType: 'Fixed', billingAmount: 2500000,
      scope: 'Full statutory audit under Companies Act 2013',
      clientId: clients[0].id, firmId: firm.id,
      members: {
        create: [
          { userId: partner.id, role: 'Lead' },
          { userId: manager.id, role: 'Reviewer' },
          { userId: staff1.id, role: 'Preparer' },
          { userId: staff2.id, role: 'Preparer' },
        ],
      },
    },
  });

  const eng2 = await prisma.engagement.create({
    data: {
      title: 'Tax Audit u/s 44AB FY 2024-25',
      type: 'Tax (44AB)', financialYear: '2024-25', status: 'Planning',
      progress: 15,
      startDate: new Date('2025-07-01'), deadline: new Date('2025-09-30'),
      billingType: 'Fixed', billingAmount: 800000,
      clientId: clients[1].id, firmId: firm.id,
      members: {
        create: [
          { userId: partner.id, role: 'Lead' },
          { userId: manager.id, role: 'Reviewer' },
          { userId: staff1.id, role: 'Preparer' },
        ],
      },
    },
  });

  const eng3 = await prisma.engagement.create({
    data: {
      title: 'Internal Audit Q1 FY 2024-25',
      type: 'Internal', financialYear: '2024-25', status: 'Under Review',
      progress: 85,
      startDate: new Date('2025-04-01'), deadline: new Date('2025-06-30'),
      billingType: 'Hourly', billingAmount: 400000,
      clientId: clients[2].id, firmId: firm.id,
      members: {
        create: [
          { userId: partner.id, role: 'Lead' },
          { userId: manager.id, role: 'Reviewer' },
          { userId: staff2.id, role: 'Preparer' },
        ],
      },
    },
  });

  const eng4 = await prisma.engagement.create({
    data: {
      title: 'GST Annual Return FY 2024-25',
      type: 'GST', financialYear: '2024-25', status: 'Closed',
      progress: 100,
      startDate: new Date('2024-10-01'), deadline: new Date('2024-12-31'),
      billingType: 'Fixed', billingAmount: 350000,
      clientId: clients[3].id, firmId: firm.id,
    },
  });

  console.log(`✅ Engagements: 4 created`);

  // ─── Workpapers ───
  const wp1 = await prisma.workpaper.create({
    data: {
      reference: 'WP-01', title: 'Cash & Bank Balance Working',
      section: 'Bank', type: 'Lead Schedule',
      status: 'Under Review',
      conclusion: 'All bank balances confirmed via independent confirmations',
      engagementId: eng1.id, preparedById: staff1.id,
      auditSteps: {
        create: [
          { stepNumber: 1, description: 'Obtain bank reconciliation statements', isCompleted: true, result: 'Obtained for all 12 bank accounts' },
          { stepNumber: 2, description: 'Send bank confirmation letters', isCompleted: true, result: 'Confirmations received for 11/12 accounts' },
          { stepNumber: 3, description: 'Test reconciling items > materiality', isCompleted: false, procedure: 'Vouch items over ₹50 lakh' },
          { stepNumber: 4, description: 'Document conclusion on cash balance assertion', isCompleted: false },
        ],
      },
    },
  });

  await prisma.workpaper.create({
    data: {
      reference: 'WP-02', title: 'Revenue Recognition Testing',
      section: 'Revenue', type: 'Standard',
      status: 'Prepared',
      engagementId: eng1.id, preparedById: staff2.id,
      auditSteps: {
        create: [
          { stepNumber: 1, description: 'Select sample of sales invoices', isCompleted: true, result: 'Sampled 60 invoices using MUS' },
          { stepNumber: 2, description: 'Verify cut-off procedures', isCompleted: false, procedure: 'Test invoices around year-end' },
          { stepNumber: 3, description: 'Test deferred revenue calculations', isCompleted: false },
        ],
      },
    },
  });

  await prisma.workpaper.create({
    data: {
      reference: 'WP-03', title: 'Fixed Assets Verification',
      section: 'Fixed Assets', type: 'Lead Schedule',
      status: 'Draft',
      engagementId: eng1.id, preparedById: staff1.id,
    },
  });

  // ─── Additional Workpapers for other engagements ───
  await prisma.workpaper.create({
    data: {
      reference: 'WP-T01', title: 'Depreciation Schedule Verification',
      section: 'Fixed Assets', type: 'Standard', status: 'Prepared',
      conclusion: 'Depreciation computed per Income Tax Act rates matches books',
      engagementId: eng2.id, preparedById: staff1.id,
      auditSteps: {
        create: [
          { stepNumber: 1, description: 'Obtain block-wise asset register', isCompleted: true, result: 'Obtained for all 8 blocks' },
          { stepNumber: 2, description: 'Verify additions and disposals', isCompleted: true, result: 'Cross-verified with purchase registers' },
          { stepNumber: 3, description: 'Recalculate depreciation per IT Act', isCompleted: true, result: 'Difference of ₹12,450 — immaterial' },
        ],
      },
    },
  });

  await prisma.workpaper.create({
    data: {
      reference: 'WP-T02', title: 'Section 40A(3) Cash Payment Verification',
      section: 'Expenses', type: 'Standard', status: 'Draft',
      engagementId: eng2.id, preparedById: staff2.id,
      auditSteps: {
        create: [
          { stepNumber: 1, description: 'Extract payments above ₹10,000 made in cash', isCompleted: true, result: '37 transactions identified' },
          { stepNumber: 2, description: 'Verify exemptions under Rule 6DD', isCompleted: false, procedure: 'Check for transport, medical, co-op society payments' },
        ],
      },
    },
  });

  await prisma.workpaper.create({
    data: {
      reference: 'WP-IA01', title: 'Procurement Process Review',
      section: 'Expenses', type: 'Standard', status: 'Reviewed',
      conclusion: 'Purchase orders above ₹5 lakh generally have 3 quotations. 2 exceptions noted.',
      engagementId: eng3.id, preparedById: staff2.id,
      auditSteps: {
        create: [
          { stepNumber: 1, description: 'Document procurement workflow', isCompleted: true, result: 'Flowchart prepared per management representation' },
          { stepNumber: 2, description: 'Test sample of 25 purchase orders', isCompleted: true, result: '23/25 had 3+ quotations; 2 emergency purchases lacked quotes' },
          { stepNumber: 3, description: 'Verify vendor empanelment process', isCompleted: true, result: 'Panel reviewed annually; last updated Oct 2024' },
        ],
      },
    },
  });

  await prisma.workpaper.create({
    data: {
      reference: 'WP-IA02', title: 'Payroll Controls Testing',
      section: 'Payroll', type: 'Standard', status: 'Under Review',
      engagementId: eng3.id, preparedById: staff2.id,
      auditSteps: {
        create: [
          { stepNumber: 1, description: 'Reconcile payroll register with bank statement', isCompleted: true, result: 'Matched for all 3 months' },
          { stepNumber: 2, description: 'Test attendance to payroll linkage', isCompleted: true, result: 'Biometric data matches payroll for sampled employees' },
          { stepNumber: 3, description: 'Verify PF/ESI computation', isCompleted: false, procedure: 'Recalculate for 10 employees per month' },
        ],
      },
    },
  });

  console.log(`✅ Workpapers: 7 total created with audit steps`);

  // ─── Review Comments ───
  await Promise.all([
    prisma.reviewComment.create({
      data: {
        content: 'Please add more detail on the cut-off testing methodology for revenue near year-end.',
        workpaperId: wp1.id, authorId: manager.id,
      },
    }),
    prisma.reviewComment.create({
      data: {
        content: 'Confirmation for HDFC Bank account #4567 still pending — follow up with the bank.',
        workpaperId: wp1.id, authorId: partner.id,
      },
    }),
    prisma.reviewComment.create({
      data: {
        content: 'Good work on the MUS sampling. Please document the confidence level and tolerable deviation used.',
        workpaperId: wp1.id, authorId: manager.id, isResolved: true,
      },
    }),
  ]);

  console.log(`✅ Review Comments: 3 created`);

  // ─── Documents (demo files — dummy BLOB data for seeding) ───
  const dummyPdf = Buffer.from('%PDF-1.4 dummy seed file content');
  const dummyXlsx = Buffer.from('PK dummy xlsx seed file content');
  const dummyDocx = Buffer.from('PK dummy docx seed file content');

  await Promise.all([
    prisma.document.create({
      data: {
        fileName: 'ril_bank_confirmation_hdfc.pdf', originalName: 'HDFC Bank Confirmation - RIL.pdf',
        mimeType: 'application/pdf', size: 245000, storagePath: '/blob',
        category: 'Bank Statement', folder: 'Current File', version: 1,
        engagementId: eng1.id, uploadedById: staff1.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'ril_trial_balance_mar25.xlsx', originalName: 'Trial Balance as at 31-Mar-2025.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 1820000,
        storagePath: '/blob',
        category: 'Ledger', folder: 'Current File', version: 1,
        engagementId: eng1.id, uploadedById: manager.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'ril_engagement_letter.pdf', originalName: 'Engagement Letter - Signed.pdf',
        mimeType: 'application/pdf', size: 420000, storagePath: '/blob',
        category: 'Other', folder: 'Permanent File', version: 1,
        engagementId: eng1.id, uploadedById: partner.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'ril_audit_plan_2025.docx', originalName: 'Audit Plan FY 2024-25 - RIL.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 356000,
        storagePath: '/blob',
        category: 'Other', folder: 'Current File', version: 2,
        engagementId: eng1.id, uploadedById: manager.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'ril_tds_cert_q4.pdf', originalName: 'TDS Certificate Q4 - 26AS.pdf',
        mimeType: 'application/pdf', size: 178000, storagePath: '/blob',
        category: 'TDS Cert', folder: 'Current File', version: 1,
        engagementId: eng1.id, uploadedById: staff2.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'tcs_financial_statements.pdf', originalName: 'TCS Financial Statements FY 2024-25.pdf',
        mimeType: 'application/pdf', size: 2450000, storagePath: '/blob',
        category: 'Ledger', folder: 'Current File', version: 1,
        engagementId: eng2.id, uploadedById: staff1.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'infosys_internal_policy.pdf', originalName: 'Procurement Policy Manual.pdf',
        mimeType: 'application/pdf', size: 890000, storagePath: '/blob',
        category: 'Other', folder: 'Permanent File', version: 1,
        engagementId: eng3.id, uploadedById: staff2.id,
      },
    }),
  ]);

  console.log(`✅ Documents: 7 created`);

  // ─── Document Requests ───
  await Promise.all([
    prisma.documentRequest.create({
      data: {
        title: 'Bank Balance Confirmation Letters',
        description: 'Need signed bank confirmation letters for all 12 bank accounts as at 31-Mar-2025',
        status: 'Received', dueDate: new Date('2025-05-15'), engagementId: eng1.id,
      },
    }),
    prisma.documentRequest.create({
      data: {
        title: 'Minutes of Board Meetings',
        description: 'Board meeting minutes from April 2024 to March 2025 for compliance review',
        status: 'Pending', dueDate: new Date('2025-06-30'), engagementId: eng1.id,
      },
    }),
    prisma.documentRequest.create({
      data: {
        title: 'Computation of Income & Tax Summary',
        description: 'Detailed computation of total income with supporting schedules for FY 2024-25',
        status: 'Pending', dueDate: new Date('2025-08-15'), engagementId: eng2.id,
      },
    }),
  ]);

  console.log(`✅ Document Requests: 3 created`);

  // ─── Deadlines ───
  await Promise.all([
    prisma.deadline.create({
      data: { title: 'Complete fieldwork - RIL', dueDate: new Date('2025-08-15'), type: 'Internal', status: 'On Track', engagementId: eng1.id },
    }),
    prisma.deadline.create({
      data: { title: 'Tax Audit Report filing u/s 44AB', dueDate: new Date('2025-09-30'), type: 'Statutory', status: 'On Track', engagementId: eng2.id },
    }),
    prisma.deadline.create({
      data: { title: 'Submit internal audit report Q1', dueDate: new Date('2025-07-31'), type: 'Internal', status: 'At Risk', engagementId: eng3.id },
    }),
    prisma.deadline.create({
      data: { title: 'GSTR-9 Annual Return filing', dueDate: new Date('2025-12-31'), type: 'GST', status: 'On Track', engagementId: eng4.id },
    }),
    prisma.deadline.create({
      data: { title: 'Form 3CA/3CB signing', dueDate: new Date('2025-09-15'), type: 'Tax', status: 'On Track', engagementId: eng2.id },
    }),
    prisma.deadline.create({
      data: { title: 'RIL AGM - Audit Report needed', dueDate: new Date('2025-09-01'), type: 'Statutory', status: 'At Risk', engagementId: eng1.id },
    }),
    prisma.deadline.create({
      data: { title: 'MCA AOC-4 filing', dueDate: new Date('2025-10-30'), type: 'MCA', status: 'On Track', engagementId: eng1.id },
    }),
  ]);

  console.log(`✅ Deadlines: 7 created`);

  // ─── Observations (ICAI format) ───
  await Promise.all([
    prisma.observation.create({
      data: {
        title: 'Weak segregation of duties in payment process',
        severity: 'Critical',
        criteria: 'Internal controls should ensure maker-checker authorization for payments per SA 315',
        condition: 'The same person who initiates payments also approves them in the ERP system',
        cause: 'Insufficient user role configuration in ERP payment module',
        effect: 'Potential unauthorized payments may go undetected',
        recommendation: 'Implement maker-checker process for all payments above ₹50,000',
        status: 'Open', engagementId: eng1.id,
      },
    }),
    prisma.observation.create({
      data: {
        title: 'Inventory valuation method inconsistency',
        severity: 'Moderate',
        criteria: 'AS-2 / Ind AS 2 requires consistent valuation method for similar items',
        condition: 'Weighted average method applied for some products, FIFO for others without documented policy',
        cause: 'Legacy ERP migration left mixed configuration across product categories',
        effect: 'Material misstatement risk in inventory valuation of ₹2.3 crore',
        recommendation: 'Standardize inventory valuation method and document in accounting policy',
        managementResponse: 'Will implement FIFO across all product lines from Q2',
        status: 'Resolved', engagementId: eng1.id,
      },
    }),
    prisma.observation.create({
      data: {
        title: 'Related party transactions not disclosed in notes',
        severity: 'Critical',
        criteria: 'Ind AS 24 & Section 188 require full disclosure of related party transactions',
        condition: '3 transactions with director-associated entities totaling ₹4.2 crore not disclosed',
        cause: 'Incomplete related party register maintained by the company',
        effect: 'Non-compliance with Companies Act; potential qualification point',
        recommendation: 'Update related party register and disclose all transactions in notes to accounts',
        status: 'Open', engagementId: eng1.id,
      },
    }),
    prisma.observation.create({
      data: {
        title: 'Revenue recognition timing difference',
        severity: 'Moderate',
        criteria: 'Ind AS 115 requires revenue recognition when performance obligations are satisfied',
        condition: '₹85 lakh of service revenue booked in March for services delivered in April',
        cause: 'Invoice date used as revenue recognition date instead of service completion date',
        effect: 'Revenue overstated by ₹85 lakh for FY 2024-25',
        recommendation: 'Implement month-end cut-off review for service revenue',
        managementResponse: 'Agreed. Reversal entry will be passed.',
        status: 'Resolved', engagementId: eng1.id,
      },
    }),
    prisma.observation.create({
      data: {
        title: 'Purchase order approval not obtained for vendor payments',
        severity: 'Low',
        criteria: 'Company procurement policy requires PO for all purchases > ₹1 lakh',
        condition: '2 out of 25 sampled purchase orders lacked proper pre-approval',
        cause: 'Emergency procurement during factory shutdown',
        effect: 'Risk of unauthorized expenditure — limited to ₹3.4 lakh',
        recommendation: 'Implement retrospective approval process for emergency purchases',
        status: 'Open', engagementId: eng3.id,
      },
    }),
  ]);

  console.log(`✅ Observations: 5 created`);

  // ─── Reports ───
  const report = await prisma.report.create({
    data: {
      type: 'Tax Audit (3CD)', title: 'Form 3CD - Tax Audit Report FY 2024-25',
      status: 'Draft', engagementId: eng2.id,
      form3cdData: {
        create: [
          { clauseNumber: 1, clauseTitle: 'Name of the assessee', response: 'Tata Consultancy Services', isCompleted: true },
          { clauseNumber: 2, clauseTitle: 'Address', response: 'TCS House, Ravindra Annexe, Fort, Mumbai', isCompleted: true },
          { clauseNumber: 3, clauseTitle: 'PAN', response: 'AAACT2727Q', isCompleted: true },
          { clauseNumber: 4, clauseTitle: 'Status of the assessee', response: 'Company', isCompleted: true },
          { clauseNumber: 5, clauseTitle: 'Previous year', response: '01-04-2024 to 31-03-2025', isCompleted: true },
          { clauseNumber: 9, clauseTitle: 'Books of account maintained', response: 'Electronic records maintained in SAP ERP under section 2(12A)', isCompleted: true },
          { clauseNumber: 11, clauseTitle: 'Details of change in accounting policies', response: 'No change in accounting policies during the year', isCompleted: true },
          { clauseNumber: 13, clauseTitle: 'Section 145 method of accounting', response: 'Mercantile system of accounting followed consistently', isCompleted: true },
          { clauseNumber: 21, clauseTitle: 'Amounts debited to P&L allowable under IT Act', response: '', isCompleted: false },
          { clauseNumber: 26, clauseTitle: 'Tax deducted at source (TDS) compliance', response: '', isCompleted: false },
          { clauseNumber: 32, clauseTitle: 'Details of brought forward losses', response: 'No brought forward losses', isCompleted: true },
          { clauseNumber: 34, clauseTitle: 'Section 43B — statutory liabilities', response: '', isCompleted: false },
        ],
      },
    },
  });

  await prisma.report.create({
    data: {
      type: 'Statutory Audit', title: 'Independent Auditor\'s Report - RIL FY 2024-25',
      status: 'Draft', engagementId: eng1.id,
    },
  });

  await prisma.report.create({
    data: {
      type: 'Management Letter', title: 'Management Letter - Infosys Internal Audit Q1',
      status: 'Under Review', engagementId: eng3.id,
    },
  });

  console.log(`✅ Reports: 3 created (1 with 12 Form 3CD clauses)`);

  // ─── Time Entries ───
  const timeEntryData = [
    { date: new Date('2025-06-02'), hours: 6.5, description: 'Bank reconciliation testing and vouching', isBillable: true, engagementId: eng1.id, userId: staff1.id },
    { date: new Date('2025-06-02'), hours: 4.0, description: 'Revenue sample selection using MUS method', isBillable: true, engagementId: eng1.id, userId: staff2.id },
    { date: new Date('2025-06-03'), hours: 7.0, description: 'Bank confirmation follow-up and confirmation matching', isBillable: true, engagementId: eng1.id, userId: staff1.id },
    { date: new Date('2025-06-03'), hours: 5.5, description: 'Revenue cut-off testing — invoices around year-end', isBillable: true, engagementId: eng1.id, userId: staff2.id },
    { date: new Date('2025-06-04'), hours: 3.0, description: 'Review of workpapers WP-01 and WP-02', isBillable: true, engagementId: eng1.id, userId: manager.id },
    { date: new Date('2025-06-04'), hours: 5.0, description: 'Fixed assets physical verification', isBillable: true, engagementId: eng1.id, userId: staff1.id },
    { date: new Date('2025-06-05'), hours: 2.0, description: 'Tax audit planning meeting with TCS finance team', isBillable: true, engagementId: eng2.id, userId: manager.id },
    { date: new Date('2025-06-05'), hours: 6.0, description: 'Depreciation schedule recalculation', isBillable: true, engagementId: eng2.id, userId: staff1.id },
    { date: new Date('2025-06-06'), hours: 4.5, description: 'Section 40A(3) cash payment extraction', isBillable: true, engagementId: eng2.id, userId: staff2.id },
    { date: new Date('2025-06-06'), hours: 1.5, description: 'Internal team training on Ind AS 115', isBillable: false, engagementId: eng1.id, userId: manager.id },
    { date: new Date('2025-06-09'), hours: 7.0, description: 'Procurement process walkthrough and testing', isBillable: true, engagementId: eng3.id, userId: staff2.id },
    { date: new Date('2025-06-09'), hours: 3.0, description: 'Partner review of RIL fieldwork progress', isBillable: true, engagementId: eng1.id, userId: partner.id },
    { date: new Date('2025-06-10'), hours: 5.0, description: 'Payroll reconciliation and PF verification', isBillable: true, engagementId: eng3.id, userId: staff2.id },
    { date: new Date('2025-06-10'), hours: 6.5, description: 'Related party transaction identification and testing', isBillable: true, engagementId: eng1.id, userId: staff1.id },
    { date: new Date('2025-06-11'), hours: 2.5, description: 'Management letter drafting for Infosys', isBillable: true, engagementId: eng3.id, userId: manager.id },
  ];

  await prisma.timeEntry.createMany({ data: timeEntryData });
  console.log(`✅ Time Entries: ${timeEntryData.length} created`);

  // ─── Notifications ───
  await Promise.all([
    prisma.notification.create({
      data: { type: 'warning', title: 'Deadline Approaching', message: 'RIL fieldwork completion due in 15 days', userId: partner.id },
    }),
    prisma.notification.create({
      data: { type: 'info', title: 'Workpaper Ready for Review', message: 'Cash & Bank Balance Working (WP-01) submitted by Ankit', userId: manager.id },
    }),
    prisma.notification.create({
      data: { type: 'info', title: 'New Review Comment', message: 'Priya commented on WP-02: "Need more detail on cut-off testing"', userId: staff2.id },
    }),
    prisma.notification.create({
      data: { type: 'success', title: 'New Assignment', message: 'You have been assigned to TCS Tax Audit engagement', userId: staff1.id },
    }),
    prisma.notification.create({
      data: { type: 'danger', title: 'Critical Observation', message: 'Related party transactions not disclosed — requires immediate attention', userId: partner.id },
    }),
    prisma.notification.create({
      data: { type: 'warning', title: 'AGM Deadline', message: 'RIL AGM scheduled for Sep 1 — audit report must be finalized', userId: manager.id },
    }),
    prisma.notification.create({
      data: { type: 'info', title: 'Document Received', message: 'TCS Finance team uploaded Financial Statements for FY 2024-25', userId: staff1.id },
    }),
    prisma.notification.create({
      data: { type: 'success', title: 'Observation Resolved', message: 'Inventory valuation inconsistency marked as resolved by management', userId: manager.id },
    }),
    prisma.notification.create({
      data: { type: 'warning', title: 'Overdue Document Request', message: 'Board meeting minutes from RIL still pending — due date passed', userId: partner.id },
    }),
    prisma.notification.create({
      data: { type: 'info', title: 'Review Complete', message: 'Priya completed review of Procurement Process (WP-IA01)', userId: staff2.id },
    }),
  ]);

  console.log(`✅ Notifications: 10 created`);

  // ─── Office ───
  const office = await prisma.office.create({
    data: {
      name: 'M K Dandeker & Co LLP', address: 'M K Dandeker & Co LLP',
      latitude: 13.076222, longitude: 80.237540, geofenceRadius: 1500, firmId: firm.id,
    },
  });

  console.log(`✅ Office: 1 created`);

  // ─── Attendance (20 records across 2 weeks for multiple staff) ───
  const attendanceData: {
    date: Date; checkIn: Date; checkOut: Date | null; status: string;
    location: string; method: string; userId: string; officeId: string;
  }[] = [];

  const attendanceDays = [
    '2025-06-02', '2025-06-03', '2025-06-04', '2025-06-05', '2025-06-06',
    '2025-06-09', '2025-06-10', '2025-06-11', '2025-06-12', '2025-06-13',
  ];

  const staffUsers = [
    { id: staff1.id, name: 'Ankit' },
    { id: staff2.id, name: 'Neha' },
  ];

  for (const dayStr of attendanceDays) {
    for (const su of staffUsers) {
      const day = new Date(dayStr);
      const checkInHour = 9 + Math.floor(Math.random() * 2); // 9 or 10
      const checkInMin = Math.floor(Math.random() * 45); // 0-44
      const checkIn = new Date(day); checkIn.setHours(checkInHour, checkInMin, 0);
      const checkOut = new Date(day); checkOut.setHours(17 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 50), 0);
      const isLate = checkInHour >= 10;
      const locations = ['Office', 'Client Site', 'Remote'];
      const location = locations[Math.floor(Math.random() * locations.length)];

      attendanceData.push({
        date: day, checkIn, checkOut,
        status: isLate ? 'late' : 'present',
        location, method: 'face',
        userId: su.id, officeId: office.id,
      });
    }
  }

  // Manager attendance (partial — some days)
  for (const dayStr of attendanceDays.slice(0, 7)) {
    const day = new Date(dayStr);
    const checkIn = new Date(day); checkIn.setHours(9, 30, 0);
    const checkOut = new Date(day); checkOut.setHours(18, 15, 0);
    attendanceData.push({
      date: day, checkIn, checkOut,
      status: 'present', location: 'Office', method: 'face',
      userId: manager.id, officeId: office.id,
    });
  }

  await prisma.attendance.createMany({ data: attendanceData });
  console.log(`✅ Attendance: ${attendanceData.length} records created`);

  // ─── Leave Requests ───
  await Promise.all([
    prisma.leaveRequest.create({
      data: {
        type: 'Casual', fromDate: new Date('2025-06-16'), toDate: new Date('2025-06-17'),
        days: 2, reason: 'Family function in Pune', status: 'Approved',
        userId: staff1.id, approverId: manager.id,
      },
    }),
    prisma.leaveRequest.create({
      data: {
        type: 'Sick', fromDate: new Date('2025-06-20'), toDate: new Date('2025-06-20'),
        days: 1, reason: 'Unwell — doctor consultation', status: 'Approved',
        userId: staff2.id, approverId: manager.id,
      },
    }),
    prisma.leaveRequest.create({
      data: {
        type: 'Earned', fromDate: new Date('2025-07-07'), toDate: new Date('2025-07-11'),
        days: 5, reason: 'Annual vacation — planned leave', status: 'Pending',
        userId: intern.id,
      },
    }),
  ]);

  console.log(`✅ Leave Requests: 3 created`);

  // ─── Sign Offs ───
  await Promise.all([
    prisma.signOff.create({
      data: {
        type: 'Preparer', status: 'Approved', comments: 'All procedures completed as per audit program',
        signedAt: new Date('2025-06-05'), workpaperId: wp1.id, userId: staff1.id,
      },
    }),
    prisma.signOff.create({
      data: {
        type: 'Manager', status: 'Pending', comments: 'Awaiting resolution of bank confirmation for HDFC account',
        workpaperId: wp1.id, userId: manager.id,
      },
    }),
  ]);

  console.log(`✅ Sign Offs: 2 created`);

  // ─── Audit Logs ───
  await Promise.all([
    prisma.auditLog.create({
      data: {
        action: 'LOGIN', entity: 'User', entityId: partner.id,
        details: JSON.stringify({ email: 'rajesh@auditiq.in', method: 'password' }),
        ipAddress: '192.168.1.10', userId: partner.id,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'CREATE', entity: 'Workpaper', entityId: wp1.id,
        details: JSON.stringify({ reference: 'WP-01', title: 'Cash & Bank Balance Working' }),
        ipAddress: '192.168.1.15', userId: staff1.id,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'UPDATE', entity: 'Engagement', entityId: eng1.id,
        details: JSON.stringify({ field: 'progress', oldValue: 45, newValue: 55 }),
        ipAddress: '192.168.1.12', userId: manager.id,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'SIGNOFF', entity: 'Workpaper', entityId: wp1.id,
        details: JSON.stringify({ type: 'Preparer', status: 'Approved' }),
        ipAddress: '192.168.1.15', userId: staff1.id,
      },
    }),
  ]);

  console.log(`✅ Audit Logs: 5 entries created`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Audit IQ — New modules (onboarding, workflow, time, leave, vault, reports)
  // ═══════════════════════════════════════════════════════════════════════════

  const fy = '2024-25';
  const folderRoot = `storage/clients`;

  // Prospect client (for onboarding wizard testing)
  const prospectClient = await prisma.client.create({
    data: {
      name: 'Zenith Retail Pvt Ltd',
      legalName: 'Zenith Retail Private Limited',
      cin: 'U52100MH2020PTC345678',
      pan: 'AABFZ1234M',
      gstin: '27AABFZ1234M1Z5',
      category: 'Private Ltd',
      industry: 'Retail',
      address: '12 Link Road, Andheri West, Mumbai 400053',
      city: 'Mumbai',
      state: 'Maharashtra',
      contactName: 'Kavita Menon',
      contactEmail: 'kavita@zenithretail.in',
      contactPhone: '+91-9876543210',
      status: 'Prospect',
      isActive: true,
      firmId: firm.id,
    },
  });

  // Enrich existing clients with onboarding fields
  await prisma.client.update({
    where: { id: clients[0].id },
    data: {
      legalName: 'Reliance Industries Limited',
      status: 'Active',
      onboardedAt: daysAgo(120),
      folderPath: `${folderRoot}/Reliance Industries Ltd/${fy}`,
      conflictOfInterest: false,
      conflictCheckedById: partner.id,
      conflictCheckedAt: daysAgo(120),
    },
  });
  await prisma.client.update({
    where: { id: clients[1].id },
    data: {
      legalName: 'Tata Consultancy Services Limited',
      status: 'Active',
      onboardedAt: daysAgo(90),
      folderPath: `${folderRoot}/Tata Consultancy Services/${fy}`,
      conflictOfInterest: false,
      conflictCheckedById: partner.id,
      conflictCheckedAt: daysAgo(90),
    },
  });
  await prisma.client.update({
    where: { id: clients[2].id },
    data: {
      legalName: 'Infosys Limited',
      status: 'Active',
      onboardedAt: daysAgo(60),
      folderPath: `${folderRoot}/Infosys Limited/${fy}`,
    },
  });
  await prisma.client.update({
    where: { id: clients[3].id },
    data: {
      legalName: 'Bharti Airtel Limited',
      status: 'Active',
      onboardedAt: daysAgo(200),
      folderPath: `${folderRoot}/Bharti Airtel Ltd/${fy}`,
    },
  });
  await prisma.client.update({
    where: { id: clients[4].id },
    data: {
      legalName: 'Asian Paints Limited',
      status: 'Inactive',
      onboardedAt: daysAgo(400),
      folderPath: `${folderRoot}/Asian Paints Ltd/2023-24`,
    },
  });

  // KYC checklists (mix of Pending / Received / Verified)
  const kycTypes = ['PAN', 'GST Certificate', 'CIN', 'MOA', 'AOA', 'Address Proof', 'Board Resolution'];
  for (const c of [clients[0], clients[1], prospectClient]) {
    const statuses =
      c.id === clients[0].id
        ? ['Verified', 'Verified', 'Verified', 'Received', 'Pending', 'Verified', 'Received']
        : c.id === clients[1].id
          ? ['Verified', 'Received', 'Received', 'Pending', 'Pending', 'Pending', 'Pending']
          : ['Pending', 'Pending', 'Pending', 'Pending', 'Pending', 'Pending', 'Pending'];
    await prisma.kycDocument.createMany({
      data: kycTypes.map((docType, i) => ({
        clientId: c.id,
        docType,
        status: statuses[i],
        receivedAt: ['Received', 'Verified'].includes(statuses[i]) ? daysAgo(30 - i) : null,
        verifiedAt: statuses[i] === 'Verified' ? daysAgo(25 - i) : null,
        verifiedById: statuses[i] === 'Verified' ? partner.id : null,
      })),
    });
  }
  console.log('✅ KYC documents: seeded for 3 clients');

  // Workflow engagements — update existing + add kanban spread
  await prisma.engagement.update({
    where: { id: eng1.id },
    data: {
      currentStage: 'Review with Manager',
      partnerInChargeId: partner.id,
      managerId: manager.id,
      articleAssistantId: staff1.id,
      scopeIncluded: 'Statutory audit of standalone financial statements; CARO 2020; internal financial controls reporting',
      scopeExcluded: 'Consolidation of subsidiaries; tax advisory',
      deadline: addDays(5),
      elGenerated: true,
      elSignedAt: daysAgo(100),
      elSignedById: partner.id,
      elStoragePath: `${folderRoot}/Reliance Industries Ltd/${fy}/Audit/engagement-letter.pdf`,
    },
  });

  await prisma.engagement.update({
    where: { id: eng2.id },
    data: {
      currentStage: 'Execution (WIP)',
      partnerInChargeId: partner.id,
      managerId: manager.id,
      articleAssistantId: staff2.id,
      scopeIncluded: 'Tax audit u/s 44AB; Form 3CD preparation',
      scopeExcluded: 'Transfer pricing study',
      deadline: addDays(2),
      elGenerated: true,
      elSignedAt: daysAgo(80),
      elSignedById: partner.id,
    },
  });

  await prisma.engagement.update({
    where: { id: eng3.id },
    data: {
      currentStage: 'Partner Review',
      partnerInChargeId: partner.id,
      managerId: manager.id,
      articleAssistantId: staff2.id,
      deadline: addDays(12),
    },
  });

  await prisma.engagement.update({
    where: { id: eng4.id },
    data: {
      currentStage: 'Filed',
      partnerInChargeId: partner.id,
      managerId: manager.id,
      articleAssistantId: staff1.id,
      udin: '24053101ABCD1234',
      filedAt: daysAgo(30),
      deadline: daysAgo(10),
    },
  });

  const engGstPending = await prisma.engagement.create({
    data: {
      title: 'GSTR-9 Annual Return FY 2024-25',
      type: 'GST',
      financialYear: fy,
      status: 'Fieldwork',
      progress: 30,
      currentStage: 'Data Pending',
      partnerInChargeId: partner.id,
      managerId: manager.id,
      articleAssistantId: staff2.id,
      deadline: addDays(1),
      billingType: 'Fixed',
      billingAmount: 180000,
      clientId: clients[4].id,
      firmId: firm.id,
    },
  });

  const engDraftReady = await prisma.engagement.create({
    data: {
      title: 'ITR Filing FY 2024-25 — HNI Individual',
      type: 'Income Tax',
      financialYear: fy,
      status: 'Reporting',
      progress: 70,
      currentStage: 'Draft Ready',
      partnerInChargeId: partner.id,
      managerId: manager.id,
      articleAssistantId: staff1.id,
      deadline: addDays(14),
      billingAmount: 45000,
      clientId: prospectClient.id,
      firmId: firm.id,
    },
  });

  const engUdin = await prisma.engagement.create({
    data: {
      title: 'Tax Audit Report FY 2024-25',
      type: 'Tax (44AB)',
      financialYear: fy,
      status: 'Reporting',
      progress: 95,
      currentStage: 'UDIN Generated',
      partnerInChargeId: partner.id,
      managerId: manager.id,
      articleAssistantId: staff2.id,
      udin: '24052099XYZW5678',
      deadline: addDays(4),
      billingAmount: 650000,
      clientId: clients[2].id,
      firmId: firm.id,
    },
  });

  // Stage history
  const stageTransitions: { engId: string; from: string | null; to: string; actorId: string; daysBack: number }[] = [
    { engId: eng1.id, from: null, to: 'Data Pending', actorId: manager.id, daysBack: 90 },
    { engId: eng1.id, from: 'Data Pending', to: 'Data Received', actorId: staff1.id, daysBack: 75 },
    { engId: eng1.id, from: 'Data Received', to: 'Execution (WIP)', actorId: staff1.id, daysBack: 60 },
    { engId: eng1.id, from: 'Execution (WIP)', to: 'Draft Ready', actorId: staff1.id, daysBack: 30 },
    { engId: eng1.id, from: 'Draft Ready', to: 'Review with Manager', actorId: manager.id, daysBack: 10 },
    { engId: eng2.id, from: null, to: 'Data Pending', actorId: manager.id, daysBack: 45 },
    { engId: eng2.id, from: 'Data Pending', to: 'Data Received', actorId: staff2.id, daysBack: 35 },
    { engId: eng2.id, from: 'Data Received', to: 'Execution (WIP)', actorId: staff2.id, daysBack: 20 },
    { engId: eng4.id, from: 'Partner Review', to: 'UDIN Generated', actorId: partner.id, daysBack: 35 },
    { engId: eng4.id, from: 'UDIN Generated', to: 'Filed', actorId: partner.id, daysBack: 30 },
  ];
  for (const t of stageTransitions) {
    await prisma.engagementStageHistory.create({
      data: {
        engagementId: t.engId,
        fromStage: t.from,
        toStage: t.to,
        actorId: t.actorId,
        notes: t.to === 'Filed' ? 'GSTR-9 filed with client confirmation' : null,
        createdAt: daysAgo(t.daysBack),
      },
    });
  }
  console.log(`✅ Stage history: ${stageTransitions.length} transitions`);

  // Data checklist (Missing >48h triggers scheduler follow-ups)
  await prisma.dataChecklistItem.createMany({
    data: [
      { engagementId: eng1.id, title: 'Trial balance as at 31-Mar-2025', status: 'Received', receivedAt: daysAgo(70) },
      { engagementId: eng1.id, title: 'Bank statements — all accounts', status: 'Received', receivedAt: daysAgo(65) },
      { engagementId: eng1.id, title: 'Related party transaction list', status: 'Requested' },
      {
        engagementId: eng2.id,
        title: 'Fixed asset register with depreciation',
        status: 'Missing',
        requestedAt: daysAgo(4),
        lastFollowupAt: daysAgo(2),
        followupCount: 1,
      },
      {
        engagementId: eng2.id,
        title: 'TDS challans and Form 26AS',
        status: 'Missing',
        requestedAt: daysAgo(5),
        followupCount: 0,
      },
      { engagementId: engGstPending.id, title: 'GSTR-1 / 3B summaries for FY', status: 'Requested' },
      { engagementId: engDraftReady.id, title: 'Form 16 and capital gains statement', status: 'Received', receivedAt: daysAgo(3) },
    ],
  });
  console.log('✅ Data checklist: 7 items');

  // Tasks (Today's To-Do)
  await prisma.task.createMany({
    data: [
      {
        title: 'Complete bank confirmation follow-up — HDFC',
        priority: 'Urgent',
        status: 'Open',
        dueDate: addDays(1),
        assigneeId: staff1.id,
        createdById: manager.id,
        engagementId: eng1.id,
      },
      {
        title: 'Draft Form 3CD clauses 21 and 26',
        priority: 'High',
        status: 'In Progress',
        dueDate: addDays(3),
        assigneeId: staff2.id,
        createdById: manager.id,
        engagementId: eng2.id,
      },
      {
        title: 'Review procurement workpaper WP-IA01',
        priority: 'Normal',
        status: 'Open',
        dueDate: addDays(5),
        assigneeId: manager.id,
        createdById: partner.id,
        engagementId: eng3.id,
      },
      {
        title: 'Upload GSTR-9 working papers',
        priority: 'High',
        status: 'Open',
        dueDate: addDays(2),
        assigneeId: staff2.id,
        createdById: manager.id,
        engagementId: engGstPending.id,
      },
      {
        title: 'ICAI E-Diary entry for last fortnight',
        priority: 'Normal',
        status: 'Done',
        dueDate: daysAgo(2),
        completedAt: daysAgo(1),
        assigneeId: staff2.id,
        createdById: staff2.id,
      },
    ],
  });
  console.log('✅ Tasks: 5 created');

  // Recent time entries (work types + billable mix for heatmap / reports)
  const recentTime = [
    { date: daysAgo(0), hours: 4, workType: 'Audit', description: 'RIL revenue testing', isBillable: true, engagementId: eng1.id, userId: staff1.id },
    { date: daysAgo(0), hours: 2, workType: 'Internal', description: 'Team stand-up and file organisation', isBillable: false, engagementId: eng1.id, userId: staff1.id },
    { date: daysAgo(1), hours: 7.5, workType: 'GST Filing', description: 'GSTR-3B reconciliation', isBillable: true, engagementId: eng4.id, userId: staff1.id },
    { date: daysAgo(1), hours: 6, workType: 'Audit', description: 'TCS depreciation schedule', isBillable: true, engagementId: eng2.id, userId: staff2.id },
    { date: daysAgo(2), hours: 3, workType: 'Consultation', description: 'Client call — scope discussion', isBillable: true, engagementId: eng2.id, userId: manager.id },
    { date: daysAgo(3), hours: 8, workType: 'IT Filing', description: 'ITR draft preparation', isBillable: true, engagementId: engDraftReady.id, userId: staff1.id },
    { date: daysAgo(4), hours: 1.5, workType: 'Internal', description: 'Office admin — CPE registration', isBillable: false, engagementId: eng1.id, userId: staff2.id },
    { date: daysAgo(5), hours: 5, workType: 'Audit', description: 'Infosys IA payroll testing', isBillable: true, engagementId: eng3.id, userId: staff2.id },
    { date: daysAgo(6), hours: 9, workType: 'Audit', description: 'Year-end close support', isBillable: true, engagementId: eng1.id, userId: staff1.id },
    { date: daysAgo(7), hours: 4, workType: 'GST Filing', description: 'Asian Paints GSTR-9 draft', isBillable: true, engagementId: engGstPending.id, userId: staff2.id },
  ];
  await prisma.timeEntry.createMany({ data: recentTime });
  console.log(`✅ Recent time entries: ${recentTime.length} (with workType)`);

  // Statutory deadlines for management reports (RAG)
  await prisma.deadline.createMany({
    data: [
      { title: 'GSTR-1 — May 2026', dueDate: addDays(2), type: 'GST', status: 'At Risk', engagementId: engGstPending.id },
      { title: 'GSTR-3B — May 2026', dueDate: addDays(11), type: 'GST', status: 'On Track', engagementId: eng4.id },
      { title: 'TDS Challan — May 2026', dueDate: addDays(1), type: 'Tax', status: 'At Risk', engagementId: eng2.id },
      { title: 'ITR filing — non-audit cases', dueDate: addDays(6), type: 'Tax', status: 'On Track', engagementId: engDraftReady.id },
      { title: 'Tax audit report signing', dueDate: addDays(3), type: 'Statutory', status: 'At Risk', engagementId: engUdin.id },
      { title: 'ROC AOC-4 — RIL', dueDate: addDays(25), type: 'MCA', status: 'On Track', engagementId: eng1.id },
    ],
  });

  // Articleship + stipend (Neha = article clerk)
  await prisma.articleshipRecord.create({
    data: {
      userId: staff2.id,
      registrationNo: 'ART-2023-45821',
      startDate: new Date('2023-07-01'),
      expectedEndDate: new Date('2026-06-30'),
      examLeaveUsed: 12,
      casualLeaveUsed: 4,
      sickLeaveUsed: 2,
    },
  });

  const stipendMonths = [
    { month: 3, year: 2026, articleYear: 3, amount: 10000, status: 'Paid' as const },
    { month: 4, year: 2026, articleYear: 3, amount: 10000, status: 'Paid' as const },
    { month: 5, year: 2026, articleYear: 3, amount: 10000, status: 'Pending' as const },
  ];
  for (const s of stipendMonths) {
    await prisma.stipendRecord.create({
      data: {
        userId: staff2.id,
        ...s,
        paidAt: s.status === 'Paid' ? daysAgo(5) : null,
      },
    });
  }

  // Leave requests (two-step ICAI types)
  await prisma.leaveRequest.create({
    data: {
      type: 'Exam',
      examLevel: 'Final',
      fromDate: addDays(14),
      toDate: addDays(18),
      days: 5,
      reason: 'CA Final Group II examination',
      status: 'Manager Approved',
      managerApprovedAt: daysAgo(1),
      managerApprovedBy: manager.id,
      userId: staff2.id,
    },
  });
  await prisma.leaveRequest.create({
    data: {
      type: 'Study',
      fromDate: addDays(21),
      toDate: addDays(22),
      days: 2,
      reason: 'Study leave before exams',
      status: 'Pending',
      userId: staff2.id,
    },
  });
  const staff1CasualLeave = await prisma.leaveRequest.findFirst({
    where: { userId: staff1.id, type: 'Casual' },
  });
  if (staff1CasualLeave) {
    await prisma.leaveRequest.update({
      where: { id: staff1CasualLeave.id },
      data: {
        status: 'Approved',
        managerApprovedAt: daysAgo(10),
        managerApprovedBy: manager.id,
        partnerApprovedAt: daysAgo(9),
        partnerApprovedBy: partner.id,
      },
    });
  }

  console.log('✅ Articleship, stipend, ICAI leave samples');

  // Password vault (set VAULT_ENCRYPTION_KEY=auditiq-dev-vault-key-for-seed-only in .env to reveal)
  const vaultEntries = await Promise.all([
    prisma.passwordVaultEntry.create({
      data: {
        clientId: clients[0].id,
        portalName: 'Income Tax',
        username: 'ril_audit@incometax.gov.in',
        passwordEnc: encryptForSeed('DemoITPass@2025'),
        notes: 'E-filing portal — use DSC token #2',
        createdById: partner.id,
      },
    }),
    prisma.passwordVaultEntry.create({
      data: {
        clientId: clients[0].id,
        portalName: 'GST',
        username: '27AAACR5055K1ZP',
        passwordEnc: encryptForSeed('DemoGST@2025'),
        createdById: manager.id,
      },
    }),
    prisma.passwordVaultEntry.create({
      data: {
        clientId: clients[1].id,
        portalName: 'MCA',
        username: 'tcs_mca_admin',
        passwordEnc: encryptForSeed('DemoMCA@2025'),
        createdById: partner.id,
      },
    }),
  ]);

  await prisma.vaultAccessLog.create({
    data: {
      entryId: vaultEntries[0].id,
      userId: partner.id,
      action: 'reveal',
      ipAddress: '127.0.0.1',
      createdAt: daysAgo(1),
    },
  });

  console.log('✅ Password vault: 3 entries (+ audit log)');

  // UDIN log
  await prisma.udinLog.createMany({
    data: [
      {
        udin: '24053101ABCD1234',
        caName: 'CA Rajesh Sharma',
        caUserId: partner.id,
        clientId: clients[3].id,
        documentType: 'GST Annual Return',
        engagementId: eng4.id,
        generatedAt: daysAgo(30),
        status: 'Active',
      },
      {
        udin: '24052099XYZW5678',
        caName: 'CA Rajesh Sharma',
        caUserId: partner.id,
        clientId: clients[2].id,
        documentType: 'Tax Audit',
        engagementId: engUdin.id,
        generatedAt: daysAgo(5),
        status: 'Active',
      },
      {
        udin: '23101500REVOKED01',
        caName: 'CA Rajesh Sharma',
        caUserId: partner.id,
        clientId: clients[4].id,
        documentType: 'Certification',
        status: 'Revoked',
        revokedAt: daysAgo(100),
        revokeReason: 'Issued in error — re-issued with new UDIN',
      },
    ],
  });
  console.log('✅ UDIN log: 3 entries');

  // Invoices & payments
  const inv1 = await prisma.invoice.create({
    data: {
      invoiceNo: 'INV-2025-0042',
      clientId: clients[0].id,
      engagementId: eng1.id,
      amount: 2500000,
      tax: 450000,
      totalAmount: 2950000,
      description: 'Statutory audit fees FY 2024-25 (excl. out-of-pocket)',
      issueDate: daysAgo(30),
      dueDate: addDays(15),
      status: 'Partial',
      paidAmount: 1500000,
      createdById: partner.id,
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv1.id,
      amount: 1500000,
      method: 'Bank Transfer',
      reference: 'NEFT-RIL-15052025',
      paidAt: daysAgo(20),
    },
  });

  await prisma.invoice.create({
    data: {
      invoiceNo: 'INV-2025-0058',
      clientId: clients[1].id,
      engagementId: eng2.id,
      amount: 800000,
      tax: 144000,
      totalAmount: 944000,
      issueDate: daysAgo(10),
      dueDate: addDays(20),
      status: 'Unpaid',
      createdById: partner.id,
    },
  });

  await prisma.invoice.create({
    data: {
      invoiceNo: 'INV-2025-0031',
      clientId: clients[3].id,
      engagementId: eng4.id,
      amount: 350000,
      tax: 63000,
      totalAmount: 413000,
      issueDate: daysAgo(60),
      dueDate: daysAgo(30),
      status: 'Paid',
      paidAmount: 413000,
      createdById: partner.id,
      payments: {
        create: {
          amount: 413000,
          method: 'UPI',
          reference: 'UPI-AIRTEL-GST9',
          paidAt: daysAgo(28),
        },
      },
    },
  });

  console.log('✅ Invoices: 3 (+ payments)');

  // Client portal users
  const portalHash = await bcrypt.hash('clientportal123', 12);
  await prisma.clientPortalUser.create({
    data: {
      clientId: clients[0].id,
      email: 'portal@reliance.in',
      passwordHash: portalHash,
      fullName: 'Vikram Singh',
      mobile: '+91-9820011234',
      isActive: true,
      lastLoginAt: daysAgo(3),
    },
  });
  await prisma.clientPortalUser.create({
    data: {
      clientId: clients[1].id,
      email: 'portal@tcs.com',
      passwordHash: portalHash,
      fullName: 'Ramesh Iyer',
      mobile: '+91-9821015678',
      isActive: true,
    },
  });

  console.log('✅ Client portal users: portal@reliance.in / portal@tcs.com → clientportal123');

  // Communications log
  await prisma.commsLog.createMany({
    data: [
      {
        clientId: clients[0].id,
        engagementId: eng1.id,
        templateKey: 'welcome',
        toAddress: 'vikram@reliance.in',
        subject: 'Welcome to M.K. Dandeker & Co LLP client portal',
        body: '<p>Dear Vikram,</p><p>Your portal login is ready. Please upload the documents listed in your checklist.</p>',
        status: 'sent',
        sentAt: daysAgo(120),
      },
      {
        clientId: clients[1].id,
        engagementId: eng2.id,
        templateKey: 'document-followup',
        toAddress: 'ramesh@tcs.com',
        subject: 'Reminder: documents pending for Tax Audit FY 2024-25',
        body: '<p>Dear Ramesh,</p><p>We are still awaiting your fixed asset register and TDS documents.</p>',
        status: 'sent',
        sentAt: daysAgo(2),
      },
      {
        clientId: clients[3].id,
        engagementId: eng4.id,
        templateKey: 'filing-confirmation',
        toAddress: 'amit@airtel.in',
        subject: 'Filing confirmation — GSTR-9 FY 2024-25',
        body: '<p>Dear Amit,</p><p>Your GSTR-9 has been filed successfully. UDIN: 24053101ABCD1234</p>',
        status: 'sent',
        sentAt: daysAgo(30),
      },
    ],
  });
  console.log('✅ Comms log: 3 entries');

  // Extra notifications for new modules
  await prisma.notification.createMany({
    data: [
      { type: 'warning', title: 'Document missing >48 hours', message: 'TCS fixed asset register not received — follow-up sent', userId: manager.id },
      { type: 'info', title: 'Task assigned', message: 'Upload GSTR-9 working papers — due in 2 days', userId: staff2.id },
      { type: 'warning', title: 'UDIN required', message: 'Engagement cannot move to Filed without UDIN', userId: partner.id },
      { type: 'success', title: 'Stipend marked paid', message: 'April 2026 stipend recorded for Neha Gupta', userId: manager.id },
    ],
  });

  console.log('\n📋 Audit IQ module test data ready:');
  console.log('   Workflow board  → 7 engagements across all stages (RAG deadlines)');
  console.log('   Onboarding      → Zenith Retail (Prospect) + KYC on 3 clients');
  console.log('   Time tracker    → Recent logs + tasks for Ankit/Neha');
  console.log('   Leave & stipend → Neha articleship; exam leave pending partner approval');
  console.log('   Password vault  → 3 credentials (Partner/Manager only)');
  console.log('   Mgmt reports    → Invoices, UDINs, profitability inputs');
  console.log('   Client portal   → portal@reliance.in / clientportal123');
  console.log('\n   Password vault uses VAULT_ENCRYPTION_KEY from server/.env\n');

  console.log('🎉 Seeding complete! Login credentials:');
  console.log('   Admin   : admin@auditiq.in / Admin@123');
  console.log('   Partner : rajesh@auditiq.in / Admin@123');
  console.log('   Manager : priya@auditiq.in / Admin@123');
  console.log('   Staff   : ankit@auditiq.in / Admin@123');
  console.log('   Staff   : neha@auditiq.in / Admin@123');
  console.log('   Intern  : rohan@auditiq.in / Admin@123');
  console.log('   Client  : vikram@reliance.in / Admin@123');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
