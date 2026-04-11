import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding AuditIQ database...\n');

  // Clean existing data (reverse dependency order)
  await prisma.auditLog.deleteMany();
  await prisma.copilotMessage.deleteMany();
  await prisma.copilotSession.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.office.deleteMany();
  await prisma.form3CDClause.deleteMany();
  await prisma.report.deleteMany();
  await prisma.observation.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.deadline.deleteMany();
  await prisma.signOff.deleteMany();
  await prisma.reviewComment.deleteMany();
  await prisma.auditStep.deleteMany();
  await prisma.document.deleteMany();
  await prisma.documentRequest.deleteMany();
  await prisma.workpaper.deleteMany();
  await prisma.engagementMember.deleteMany();
  await prisma.engagement.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.firm.deleteMany();

  // ─── Permissions (modules × actions) ───
  const modules = ['dashboard', 'engagements', 'workpapers', 'documents', 'reports', 'attendance', 'copilot', 'settings', 'clients'];
  const actions = ['view', 'create', 'edit', 'delete', 'approve', 'export'];

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
      name: 'Admin', description: 'Full system administrator with all permissions', isSystem: true,
      permissions: { create: allPerms.map((p) => ({ permissionId: p.id })) },
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
          ['dashboard', 'engagements', 'workpapers', 'documents', 'reports', 'attendance', 'copilot', 'clients'],
          ['view', 'create', 'edit', 'approve', 'export']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  const staffRole = await prisma.role.create({
    data: {
      name: 'Staff', description: 'Audit staff / article clerk with standard access', isSystem: true,
      permissions: {
        create: getPermIds(
          ['dashboard', 'engagements', 'workpapers', 'documents', 'reports', 'attendance', 'copilot'],
          ['view', 'create', 'edit']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  const internRole = await prisma.role.create({
    data: {
      name: 'Intern', description: 'Intern with limited view-only access', isSystem: false,
      permissions: {
        create: getPermIds(
          ['dashboard', 'engagements', 'workpapers', 'documents', 'attendance'],
          ['view']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  const clientRole = await prisma.role.create({
    data: {
      name: 'Client', description: 'External client with restricted portal access', isSystem: true,
      permissions: {
        create: getPermIds(
          ['dashboard', 'documents', 'reports'],
          ['view']
        ).map((pid) => ({ permissionId: pid })),
      },
    },
  });

  console.log(`✅ Roles: 6 created (Admin, Partner, Manager, Staff, Intern, Client)`);

  // ─── Firm ───
  const firm = await prisma.firm.create({
    data: {
      name: 'Sharma & Associates',
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
  const hash = await bcrypt.hash('password123', SALT_ROUNDS);

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

  console.log(`✅ Users: 6 created (Partner, Manager, 2 Staff, 1 Intern, 1 Client)`);

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

  // ─── Documents (demo files — no actual uploads) ───
  await Promise.all([
    prisma.document.create({
      data: {
        fileName: 'ril_bank_confirmation_hdfc.pdf', originalName: 'HDFC Bank Confirmation - RIL.pdf',
        mimeType: 'application/pdf', size: 245000, storagePath: '/uploads/ril_bank_confirmation_hdfc.pdf',
        category: 'Bank Statement', folder: 'Current File', version: 1,
        engagementId: eng1.id, uploadedById: staff1.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'ril_trial_balance_mar25.xlsx', originalName: 'Trial Balance as at 31-Mar-2025.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 1820000,
        storagePath: '/uploads/ril_trial_balance_mar25.xlsx',
        category: 'Ledger', folder: 'Current File', version: 1,
        engagementId: eng1.id, uploadedById: manager.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'ril_engagement_letter.pdf', originalName: 'Engagement Letter - Signed.pdf',
        mimeType: 'application/pdf', size: 420000, storagePath: '/uploads/ril_engagement_letter.pdf',
        category: 'Other', folder: 'Permanent File', version: 1,
        engagementId: eng1.id, uploadedById: partner.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'ril_audit_plan_2025.docx', originalName: 'Audit Plan FY 2024-25 - RIL.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 356000,
        storagePath: '/uploads/ril_audit_plan_2025.docx',
        category: 'Other', folder: 'Current File', version: 2,
        engagementId: eng1.id, uploadedById: manager.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'ril_tds_cert_q4.pdf', originalName: 'TDS Certificate Q4 - 26AS.pdf',
        mimeType: 'application/pdf', size: 178000, storagePath: '/uploads/ril_tds_cert_q4.pdf',
        category: 'TDS Cert', folder: 'Current File', version: 1,
        engagementId: eng1.id, uploadedById: staff2.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'tcs_financial_statements.pdf', originalName: 'TCS Financial Statements FY 2024-25.pdf',
        mimeType: 'application/pdf', size: 2450000, storagePath: '/uploads/tcs_financial_statements.pdf',
        category: 'Ledger', folder: 'Current File', version: 1,
        engagementId: eng2.id, uploadedById: staff1.id,
      },
    }),
    prisma.document.create({
      data: {
        fileName: 'infosys_internal_policy.pdf', originalName: 'Procurement Policy Manual.pdf',
        mimeType: 'application/pdf', size: 890000, storagePath: '/uploads/infosys_internal_policy.pdf',
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
      name: 'Nariman Point HQ', address: '401 Maker Chambers, Nariman Point, Mumbai',
      latitude: 18.9256, longitude: 72.8242, geofenceRadius: 200, firmId: firm.id,
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

  // ─── Copilot Sessions ───
  await prisma.copilotSession.create({
    data: {
      title: 'SA 500 Audit Evidence Guidance',
      userId: staff1.id,
      engagementId: eng1.id,
      messages: {
        create: [
          {
            role: 'user', userId: staff1.id,
            content: 'What are the key procedures under SA 500 for obtaining audit evidence?',
          },
          {
            role: 'assistant',
            content: 'Under SA 500 – Audit Evidence, the key procedures include:\n\n1. **Inspection** – Examining records, documents, or tangible assets\n2. **Observation** – Looking at a process or procedure performed by others\n3. **External Confirmation** – Direct written response from third parties (SA 505)\n4. **Recalculation** – Checking mathematical accuracy\n5. **Re-performance** – Independent execution of procedures\n6. **Analytical Procedures** – Evaluating financial information through plausible relationships (SA 520)\n7. **Inquiry** – Seeking information from knowledgeable persons\n\nThe auditor should assess both sufficiency (quantity) and appropriateness (quality = relevance + reliability) of evidence obtained.',
          },
        ],
      },
    },
  });

  await prisma.copilotSession.create({
    data: {
      title: 'Related Party Disclosure Requirements',
      userId: manager.id,
      engagementId: eng1.id,
      messages: {
        create: [
          {
            role: 'user', userId: manager.id,
            content: 'What disclosures are required under Ind AS 24 for related party transactions?',
          },
          {
            role: 'assistant',
            content: 'Under **Ind AS 24 – Related Party Disclosures**, the following must be disclosed:\n\n**For each related party relationship:**\n- Name of the related party and nature of relationship\n- Outstanding balances (receivables/payables) with terms and conditions\n\n**For each category of transactions:**\n- Purchases and sales of goods/services\n- Property and asset transfers\n- Leasing arrangements\n- Guarantees given or received\n- Key Management Personnel (KMP) compensation\n\n**Key points for RIL audit:**\n- Check Section 188 of Companies Act for prior Board/Shareholder approval\n- Verify arm\'s length pricing under Transfer Pricing regulations\n- Cross-check with Form AOC-2 filed with MCA\n- Directors\' report must include related party policy details\n\nGiven the 3 undisclosed transactions we found, this is a potential qualification matter.',
          },
          {
            role: 'user', userId: manager.id,
            content: 'How should we report this in the audit report?',
          },
          {
            role: 'assistant',
            content: 'For the undisclosed related party transactions (₹4.2 crore), the reporting approach depends on management\'s response:\n\n**If management agrees to correct:**\n- Verify the corrected disclosures\n- No qualification needed if fully disclosed before signing\n- Document in working papers as "resolved"\n\n**If management refuses to disclose:**\n- This is a material misstatement in disclosures per SA 705\n- Issue a **Qualified Opinion** with specific paragraph:\n  *"Except for the non-disclosure of related party transactions..."*\n- Reference Ind AS 24 and Section 188\n\n**CARO 2020 impact:**\n- Clause (xiii) — specifically asks about related party transactions\n- Must report adverse remarks if not at arm\'s length or not approved\n\n**Recommended action:** Send formal management representation request and set a deadline before the audit report signing date.',
          },
        ],
      },
    },
  });

  await prisma.copilotSession.create({
    data: {
      title: 'Tax Audit Checklist - Section 44AB',
      userId: staff2.id,
      engagementId: eng2.id,
      messages: {
        create: [
          {
            role: 'user', userId: staff2.id,
            content: 'Can you give me a checklist for Section 44AB tax audit procedures?',
          },
          {
            role: 'assistant',
            content: 'Here is a structured checklist for **Tax Audit u/s 44AB**:\n\n**Phase 1 — Preliminary:**\n☐ Verify turnover threshold (> ₹1 crore for business / > ₹50 lakh for profession)\n☐ Check if presumptive taxation opted (Sec 44AD/44ADA)\n☐ Obtain engagement letter\n☐ Verify previous year Form 3CD for pending observations\n\n**Phase 2 — Books & Records:**\n☐ Verify books of account maintained (Sec 44AA)\n☐ Check if books audited under any other Act\n☐ Note accounting software used and data integrity\n\n**Phase 3 — Key Clauses:**\n☐ Clause 13(e) — Method of valuation of stock\n☐ Clause 21 — Amounts debited to P&L (Sec 40/40A/43B)\n☐ Clause 26 — TDS/TCS compliance\n☐ Clause 27 — Section 269SS/269T cash limits\n☐ Clause 30 — GAAR applicability\n☐ Clause 34 — Section 43B statutory dues\n\n**Phase 4 — Completion:**\n☐ Obtain management representation letter\n☐ Complete Form 3CA/3CB (as applicable)\n☐ File Form 3CD on e-filing portal\n☐ Due date: 30th September (extended dates if applicable)',
          },
        ],
      },
    },
  });

  console.log(`✅ Copilot: 3 sessions with messages`);

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
        action: 'AI_USAGE', entity: 'CopilotSession',
        details: JSON.stringify({ query: 'SA 500 audit procedures', tokensUsed: 450 }),
        ipAddress: '192.168.1.15', userId: staff1.id,
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

  console.log('\n🎉 Seeding complete! Login credentials:');
  console.log('   Partner : rajesh@auditiq.in / password123');
  console.log('   Manager : priya@auditiq.in / password123');
  console.log('   Staff   : ankit@auditiq.in / password123');
  console.log('   Staff   : neha@auditiq.in / password123');
  console.log('   Intern  : rohan@auditiq.in / password123');
  console.log('   Client  : vikram@reliance.in / password123');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
