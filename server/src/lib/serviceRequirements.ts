/**
 * MKD service requirement profiles — long-term catalog for CA firm operations.
 * Single source of truth: drives data checklists, client portal guidance, and in-app surfaces.
 */

import type { WorkflowDomain } from './workflowCatalog.js';

export type RequirementCategory =
  | 'client_document'
  | 'client_information'
  | 'firm_internal'
  | 'statutory';

export type AppSurface =
  | 'data_checklist'
  | 'client_portal'
  | 'client_master'
  | 'workflow_board'
  | 'documents'
  | 'engagement_detail'
  | 'billing'
  | 'messages'
  | 'time_tracker'
  | 'onboarding'
  | 'approvals'
  | 'workpapers';

export const APP_SURFACE_LABELS: Record<AppSurface, string> = {
  data_checklist: 'Engagement → Data Checklist',
  client_portal: 'Client Portal → Documents & Tracking',
  client_master: 'Clients → Client Master (KYC / statutory profile)',
  workflow_board: 'Workflow Board (DT / IDT / Audit practice area)',
  documents: 'Document Library',
  engagement_detail: 'Engagement Detail (command centre)',
  billing: 'Billing & Invoices',
  messages: 'Messages (engagement team chat)',
  time_tracker: 'Time Tracker & billing entries',
  onboarding: 'Client Onboarding',
  approvals: 'Approvals (sign-offs & leave)',
  workpapers: 'Workpapers (audit documentation)',
};

export const CATEGORY_LABELS: Record<RequirementCategory, string> = {
  client_document: 'Documents required from client',
  client_information: 'Information / confirmations from client',
  firm_internal: 'Prepared / verified by firm team',
  statutory: 'Regulatory & compliance context',
};

export type ServiceRequirement = {
  id: string;
  category: RequirementCategory;
  title: string;
  description: string;
  mandatory: boolean;
  surfaces: AppSurface[];
};

export type ServiceTaskTemplate = {
  title: string;
  description: string;
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  dueDaysBefore: number;
};

export type ServiceProfile = {
  code: string;
  domain: WorkflowDomain;
  summary: string;
  authority: string;
  applicability: string;
  /** Plain-language bullets the firm will ask the client at kick-off */
  firmWillAsk: string[];
  requirements: ServiceRequirement[];
  checklistItems: { title: string; description?: string }[];
  internalTasks: ServiceTaskTemplate[];
};

function req(
  id: string,
  category: RequirementCategory,
  title: string,
  description: string,
  surfaces: AppSurface[],
  mandatory = true
): ServiceRequirement {
  return { id, category, title, description, mandatory, surfaces };
}

const KYC_BASE: ServiceRequirement[] = [
  req('kyc_pan', 'client_information', 'Permanent Account Number (PAN)', 'Valid PAN of entity and authorised signatory.', ['client_master', 'onboarding']),
  req('kyc_gstin', 'client_information', 'GSTIN (if registered)', 'All active GST registrations with state codes.', ['client_master', 'onboarding'], false),
  req('kyc_signatory', 'client_information', 'Authorised signatory details', 'Name, designation, email, and mobile of person authorised for confirmations and e-filing.', ['client_master', 'onboarding']),
  req('kyc_portal', 'client_information', 'Portal credentials / DSC access', 'Income Tax, TRACES, GST, or MCA portal access as applicable (or firm-filed with POA).', ['client_portal', 'engagement_detail'], false),
];

function dtProfile(
  code: string,
  name: string,
  summary: string,
  authority: string,
  applicability: string,
  firmWillAsk: string[],
  extra: ServiceRequirement[],
  checklist: { title: string; description?: string }[],
  tasks: ServiceTaskTemplate[]
): ServiceProfile {
  return {
    code,
    domain: 'DT',
    summary,
    authority,
    applicability,
    firmWillAsk,
    requirements: [...KYC_BASE, ...extra],
    checklistItems: checklist,
    internalTasks: tasks,
  };
}

function idtProfile(
  code: string,
  _name: string,
  summary: string,
  authority: string,
  applicability: string,
  firmWillAsk: string[],
  extra: ServiceRequirement[],
  checklist: { title: string; description?: string }[],
  tasks: ServiceTaskTemplate[]
): ServiceProfile {
  return {
    code,
    domain: 'IDT',
    summary,
    authority,
    applicability,
    firmWillAsk,
    requirements: [...KYC_BASE, ...extra],
    checklistItems: checklist,
    internalTasks: tasks,
  };
}

function auditProfile(
  code: string,
  _name: string,
  summary: string,
  authority: string,
  applicability: string,
  firmWillAsk: string[],
  extra: ServiceRequirement[],
  checklist: { title: string; description?: string }[],
  tasks: ServiceTaskTemplate[]
): ServiceProfile {
  return {
    code,
    domain: 'AUDIT',
    summary,
    authority,
    applicability,
    firmWillAsk,
    requirements: [...KYC_BASE, ...extra],
    checklistItems: checklist,
    internalTasks: tasks,
  };
}

const DT_MONTHLY_TASKS: ServiceTaskTemplate[] = [
  { title: 'Compile deductee-wise TDS/TCS data', description: 'Reconcile deductee ledger with books and challan history.', priority: 'High', dueDaysBefore: 5 },
  { title: 'Prepare challan and validate BSR', description: 'Generate challan, verify BSR code, and obtain client approval for remittance.', priority: 'Urgent', dueDaysBefore: 2 },
  { title: 'File statement / return and archive proof', description: 'File on portal, download acknowledgement, and file in engagement documentation.', priority: 'Urgent', dueDaysBefore: 1 },
];

export const SERVICE_PROFILES: Record<string, ServiceProfile> = {
  TDS_REMITTANCE: dtProfile(
    'TDS_REMITTANCE',
    'TDS remittance',
    'Monthly deposit of tax deducted at source under Chapter XVII-B of the Income Tax Act.',
    'Income Tax Act, 1961 — Sections 192 to 206AB; Rule 30',
    'All deductors with TDS obligations for the month.',
    [
      'Which sections and deductee categories applied this month?',
      'Were any lower-deduction or nil-deduction certificates used?',
      'Confirm bank account for challan payment and remittance date.',
      'Any interest or late-fee exposure from prior months?',
    ],
    [
      req('tds_ledger', 'client_document', 'TDS deduction ledger (month)', 'Section-wise deductee ledger with PAN, amount paid/credited, rate, and TDS amount.', ['data_checklist', 'client_portal']),
      req('tds_challans', 'client_document', 'Prior month challans & Form 16/16A', 'Challan statements (CSI) and certificates already issued, if any.', ['data_checklist']),
      req('tds_books', 'client_document', 'Books excerpt — expenses / payments', 'Payment register or GL extract for deductable payments.', ['data_checklist']),
      req('tds_traces', 'firm_internal', 'TRACES / OLTAS reconciliation', 'Firm reconciles challan credit in TRACES before filing.', ['engagement_detail']),
      req('tds_due', 'statutory', 'Due date: 7th of following month', 'Extended to next working day if 7th is a bank holiday.', ['workflow_board']),
    ],
    [
      { title: 'TDS deduction ledger (month)', description: 'Deductee-wise with PAN and section codes' },
      { title: 'Payment / expense register for deductable items' },
      { title: 'Prior challans & CSI statement' },
      { title: 'Lower / nil deduction certificates (if any)' },
      { title: 'Bank confirmation for remittance' },
    ],
    DT_MONTHLY_TASKS
  ),

  TDS_QUARTERLY: dtProfile(
    'TDS_QUARTERLY',
    'TDS quarterly return',
    'Quarterly TDS statement in Form 24Q / 26Q / 27Q / 27EQ as applicable.',
    'Income Tax Act — Section 200(3); Rule 31A',
    'All deductors filing quarterly statements.',
    [
      'Which forms apply — salary (24Q), non-salary (26Q), NRI (27Q), TCS (27EQ)?',
      'Any corrections to prior quarters (conso file / revision)?',
      'Confirm contact person for default notices.',
    ],
    [
      req('tds_qtr_ledger', 'client_document', 'Quarterly TDS/TCS books', 'Complete quarter ledger reconciled to GL.', ['data_checklist', 'client_portal']),
      req('tds_qtr_challan', 'client_document', 'Quarterly challan summary', 'Challan-wise deposit proof with BSR and date.', ['data_checklist']),
      req('tds_qtr_16', 'client_document', 'Form 16 / 16A issued', 'Copies of certificates issued to deductees.', ['data_checklist'], false),
      req('tds_qtr_fvu', 'firm_internal', 'FVU validation & submission', 'Firm validates text file through FVU and files on Income Tax portal.', ['engagement_detail']),
    ],
    [
      { title: 'Quarterly TDS deduction ledger' },
      { title: 'Challan summary with CSI' },
      { title: 'Form 16 / 16A copies (if issued)' },
      { title: 'Prior quarter correction statements (if any)' },
    ],
    [
      { title: 'Reconcile books to challans for the quarter', description: 'Match deductee ledger, GL, and OLTAS credits.', priority: 'High', dueDaysBefore: 10 },
      { title: 'Prepare and validate TDS return text file', description: 'Run FVU; resolve PAN errors and short deductions.', priority: 'High', dueDaysBefore: 5 },
      { title: 'File quarterly statement and store acknowledgement', description: 'Upload on portal; download Form 27A / acknowledgement.', priority: 'Urgent', dueDaysBefore: 2 },
    ]
  ),

  TCS_QUARTERLY: dtProfile(
    'TCS_QUARTERLY',
    'TCS quarterly return',
    'Quarterly collection and deposit of tax at source; statement in Form 27EQ.',
    'Income Tax Act — Section 206C; Rule 37-I',
    'Sellers of specified goods / operators of e-commerce with TCS obligations.',
    [
      'Which Section 206C sub-sections triggered this quarter?',
      'Any e-commerce operator TCS (194-O) reporting?',
      'Confirm collection vs deposit differences.',
    ],
    [
      req('tcs_register', 'client_document', 'TCS collection register', 'Buyer-wise collections with PAN, amount, and section.', ['data_checklist', 'client_portal']),
      req('tcs_challans', 'client_document', 'TCS challans for quarter', 'Proof of deposit with BSR details.', ['data_checklist']),
      req('tcs_27eq', 'firm_internal', 'Form 27EQ preparation', 'Firm prepares return and validates through FVU.', ['engagement_detail']),
    ],
    [
      { title: 'TCS collection register (quarter)' },
      { title: 'TCS challan statements' },
      { title: 'Sales / invoice register for TCS goods' },
    ],
    DT_MONTHLY_TASKS
  ),

  ADVANCE_TAX: dtProfile(
    'ADVANCE_TAX',
    'Advance tax',
    'Quarterly advance tax instalments under Section 211 for taxpayers with liability ≥ ₹10,000.',
    'Income Tax Act — Sections 207 to 219',
    'Companies, firms, and individuals with tax liability after TDS/TCS credit.',
    [
      'Estimated total income and tax liability for the year?',
      'Any capital gains or one-off income this quarter?',
      'TDS/TCS credits available to offset instalment?',
    ],
    [
      req('at_estimate', 'client_information', 'Income estimate & projections', 'YTD P&L and full-year projection signed by management.', ['data_checklist', 'client_portal']),
      req('at_tds_credit', 'client_document', 'TDS/TCS credit summary', 'Credits available per Form 26AS / AIS.', ['data_checklist']),
      req('at_challan', 'firm_internal', 'Challan computation & payment', 'Firm computes instalment per Section 211 and files challan.', ['engagement_detail', 'billing']),
      req('at_due', 'statutory', 'Instalment due dates', '15 Jun / 15 Sep / 15 Dec / 15 Mar (15% / 45% / 75% / 100% rule).', ['workflow_board']),
    ],
    [
      { title: 'YTD financials / management accounts' },
      { title: 'Full-year income projection' },
      { title: 'Form 26AS / AIS for TDS credits' },
      { title: 'Prior advance tax challans' },
    ],
    [
      { title: 'Compute advance tax liability', description: 'Apply slab / MAT / surcharge per entity type.', priority: 'High', dueDaysBefore: 7 },
      { title: 'Obtain client approval and pay challan', description: 'Share computation; pay before statutory due date.', priority: 'Urgent', dueDaysBefore: 2 },
    ]
  ),

  FORM_145_146: dtProfile(
    'FORM_145_146',
    'Form 145 / 146',
    'Presumptive / special method applications for computing profits of certain businesses.',
    'Income Tax Act — Section 145; Rule 6F',
    'Assessees seeking change in method of accounting or stock valuation.',
    [
      'What change in accounting policy is requested?',
      'Prior year method and reason for change?',
      'Impact on revenue and tax for current and prior years?',
    ],
    [
      req('f145_application', 'client_document', 'Draft application & supporting note', 'Management note explaining proposed method.', ['data_checklist', 'client_portal']),
      req('f145_books', 'client_document', 'Books of account sample', 'Representative ledgers under current and proposed method.', ['data_checklist']),
      req('f145_firm', 'firm_internal', 'Technical review & filing', 'Partner reviews; firm files with jurisdictional AO.', ['engagement_detail', 'approvals']),
    ],
    [
      { title: 'Application draft (Form 145 / 146)' },
      { title: 'Accounting policy note from management' },
      { title: 'Trial balance under both methods (if applicable)' },
    ],
    [
      { title: 'Draft Form 145 / 146 application', description: 'Include legal basis and computation impact.', priority: 'High', dueDaysBefore: 14 },
      { title: 'Partner review and client sign-off', description: 'Obtain authorised signatory on final application.', priority: 'High', dueDaysBefore: 7 },
    ]
  ),

  SFT: dtProfile(
    'SFT',
    'Statement of Financial Transactions (SFT)',
    'Annual reporting of specified high-value transactions in Form 61A.',
    'Income Tax Act — Section 285BA; Rule 114E',
    'Reporting entities: banks, registrars, corporates with reportable transactions, etc.',
    [
      'Which SFT clauses apply to your entity this year?',
      'Any aggregation issues across related parties?',
      'Confirm reporting entity code and principal officer.',
    ],
    [
      req('sft_data', 'client_document', 'Transaction-level SFT data', 'Specified transaction reports per Rule 114E clauses.', ['data_checklist', 'client_portal']),
      req('sft_61a', 'firm_internal', 'Form 61A XML preparation', 'Firm validates schema and files on reporting portal.', ['engagement_detail']),
      req('sft_due', 'statutory', 'Due date: 31 May', 'Following the financial year end.', ['workflow_board']),
    ],
    [
      { title: 'SFT transaction dump (clause-wise)' },
      { title: 'PAN-wise aggregation workbook' },
      { title: 'Prior year Form 61A acknowledgement (if any)' },
    ],
    [
      { title: 'Map transactions to SFT clauses', description: 'Identify reportable accounts and thresholds.', priority: 'High', dueDaysBefore: 20 },
      { title: 'Validate and file Form 61A', description: 'Schema validation; obtain acknowledgement.', priority: 'Urgent', dueDaysBefore: 3 },
    ]
  ),

  FORM_10BD: dtProfile(
    'FORM_10BD',
    'Form 10BD',
    'Annual statement of donations reported by donee trusts / institutions.',
    'Income Tax Act — Section 80G; Rule 18AB',
    'Registered Section 80G / 12A entities receiving donations.',
    [
      'Donation register with donor PAN and mode of payment?',
      'Any anonymous donations above threshold?',
      '80G registration number and validity?',
    ],
    [
      req('10bd_register', 'client_document', 'Donation register', 'Donor-wise with PAN, amount, date, and mode.', ['data_checklist', 'client_portal']),
      req('10bd_80g', 'client_document', '80G registration certificate', 'Valid registration order from IT Department.', ['data_checklist', 'client_master']),
      req('10bd_file', 'firm_internal', 'Form 10BD filing', 'Firm prepares JSON and files on Income Tax portal.', ['engagement_detail']),
    ],
    [
      { title: 'Donation register (FY)' },
      { title: '80G / 12A registration copy' },
      { title: 'Bank statement — donation account' },
    ],
    [
      { title: 'Validate donor PANs and amounts', description: 'Cross-check with bank credits.', priority: 'High', dueDaysBefore: 15 },
      { title: 'File Form 10BD and issue Form 10BE', description: 'File statement; generate donor certificates.', priority: 'Urgent', dueDaysBefore: 3 },
    ]
  ),

  ITR_JULY: dtProfile(
    'ITR_JULY',
    'Income tax return (July due)',
    'Income tax return for individuals / entities with July due date (non-audit cases).',
    'Income Tax Act — Section 139(1)',
    'Individuals, HUFs, firms (non-tax-audit), companies not under October/November due dates.',
    [
      'All bank accounts and high-value transactions disclosed?',
      'Foreign assets / income (Schedule FA / FSI)?',
      'Capital gains and property sale details?',
    ],
    [
      req('itr_books', 'client_document', 'Books / computation support', 'P&L, balance sheet, or ITR-supporting schedules.', ['data_checklist', 'client_portal']),
      req('itr_26as', 'client_document', 'Form 26AS, AIS, TIS', 'Annual information statements for TDS/TCS/SFT matching.', ['data_checklist']),
      req('itr_invest', 'client_document', 'Investment & deduction proofs', '80C, 80D, HRA, home loan, donations.', ['data_checklist']),
      req('itr_compute', 'firm_internal', 'Tax computation & ITR drafting', 'Firm prepares computation and ITR JSON.', ['engagement_detail']),
      req('itr_due_jul', 'statutory', 'Due date: 31 July', 'Extended date notified by CBDT, if any.', ['workflow_board']),
    ],
    [
      { title: 'Trial balance / books of account' },
      { title: 'Form 26AS, AIS & TIS' },
      { title: 'Investment & deduction proofs' },
      { title: 'Capital gains / property documents' },
      { title: 'Foreign asset statement (if applicable)' },
      { title: 'Prior year ITR & assessment orders' },
    ],
    [
      { title: 'Prepare tax computation', description: 'Reconcile books to taxable income.', priority: 'High', dueDaysBefore: 14 },
      { title: 'Draft ITR and obtain client approval', description: 'Share draft for e-verification consent.', priority: 'High', dueDaysBefore: 7 },
      { title: 'File ITR and confirm e-verification', description: 'File on portal; track e-verify status.', priority: 'Urgent', dueDaysBefore: 2 },
    ]
  ),

  ITR_AUGUST: dtProfile(
    'ITR_AUGUST',
    'Income tax return (August due)',
    'Income tax return for audit-assigned cases with August extended due date.',
    'Income Tax Act — Section 139(1) read with notifications',
    'Assessees granted August due date (e.g. certain audit cases per notification).',
    [
      'Is tax audit report already filed / UDIN generated?',
      'Financial statements audited and signed?',
      'All related-party and transfer pricing disclosures complete?',
    ],
    [
      req('itr_aug_fs', 'client_document', 'Audited financial statements', 'Signed BS, P&L, and notes to accounts.', ['data_checklist', 'client_portal']),
      req('itr_aug_3cd', 'client_document', 'Tax audit report (3CA/3CB & 3CD)', 'If tax audit applicable.', ['data_checklist'], false),
      req('itr_aug_compute', 'firm_internal', 'ITR with audit linkage', 'Firm links audit report UDIN in ITR.', ['engagement_detail']),
    ],
    [
      { title: 'Audited financial statements' },
      { title: 'Tax audit report (if applicable)' },
      { title: 'Form 26AS, AIS & TIS' },
      { title: 'Board resolution for ITR approval' },
    ],
    [
      { title: 'Reconcile audited figures to ITR', description: 'Ensure no material differences unexplained.', priority: 'High', dueDaysBefore: 10 },
      { title: 'File ITR with audit information', description: 'Enter auditor membership and UDIN.', priority: 'Urgent', dueDaysBefore: 3 },
    ]
  ),

  TAX_AUDIT_REPORT: auditProfile(
    'TAX_AUDIT_REPORT',
    'Tax audit report u/s 44AB (September)',
    'Tax audit under Section 44AB with Forms 3CA/3CB and clause-wise Form 3CD.',
    'Income Tax Act — Section 44AB; Form 3CD (Rule 6G)',
    'Businesses / professions crossing specified turnover / gross receipt thresholds.',
    [
      'Books of account complete and balanced?',
      'All related-party and international transaction disclosures?',
      'Prior year assessment or scrutiny orders pending?',
    ],
    [
      req('ta_books', 'client_document', 'Complete books of account', 'Trial balance, ledgers, stock, and bank statements.', ['data_checklist', 'client_portal']),
      req('ta_fs', 'client_document', 'Draft financial statements', 'Management accounts or draft audited FS.', ['data_checklist']),
      req('ta_3cd_data', 'client_document', 'Form 3CD source data', 'Clause-wise information (TDS, GST, loans, donations, etc.).', ['data_checklist']),
      req('ta_udin', 'firm_internal', 'Tax audit report & UDIN', 'Partner signs; UDIN generated on ICAI portal.', ['engagement_detail', 'approvals', 'workflow_board']),
      req('ta_due_sep', 'statutory', 'Due date: 30 September', 'Report must be furnished by this date.', ['workflow_board']),
    ],
    [
      { title: 'Trial balance & general ledgers' },
      { title: 'Bank statements (all accounts)' },
      { title: 'Fixed asset register & depreciation' },
      { title: 'Loan agreements & related-party list' },
      { title: 'GST annual reconciliation' },
      { title: 'TDS / TCS summaries' },
      { title: 'Prior year tax audit report' },
    ],
    [
      { title: 'Verify regularity of books u/s 44AA', description: 'Document maintenance per applicable rules.', priority: 'High', dueDaysBefore: 20 },
      { title: 'Complete clause-wise Form 3CD', description: 'All 44 clauses assessed for applicability.', priority: 'High', dueDaysBefore: 14 },
      { title: 'Generate UDIN and issue tax audit report', description: 'Partner sign-off; share with client for ITR.', priority: 'Urgent', dueDaysBefore: 3 },
    ]
  ),

  ITR_NON_TP: dtProfile(
    'ITR_NON_TP',
    'Income tax return (non-TP)',
    'Corporate / business ITR due 31 October (non-transfer-pricing cases).',
    'Income Tax Act — Section 139(1)',
    'Companies and auditable cases not under TP due date.',
    [
      'Tax audit report filed and UDIN available?',
      'MAT / alternate minimum tax applicability?',
      'Losses and brought-forward credits verified?',
    ],
    [
      req('itr_oct_fs', 'client_document', 'Audited / signed financials', 'Final accounts for the assessment year.', ['data_checklist', 'client_portal']),
      req('itr_oct_audit', 'client_document', 'Tax audit report copy', '3CA/3CB with 3CD and UDIN.', ['data_checklist']),
      req('itr_oct_file', 'firm_internal', 'ITR preparation & filing', 'Firm files ITR-6 / applicable form.', ['engagement_detail']),
    ],
    [
      { title: 'Audited financial statements' },
      { title: 'Tax audit report with UDIN' },
      { title: 'MAT computation (if applicable)' },
      { title: 'Form 26AS, AIS & TIS' },
    ],
    [
      { title: 'Prepare corporate tax computation', description: 'Include MAT, surcharge, and cess.', priority: 'High', dueDaysBefore: 12 },
      { title: 'File ITR and track processing', description: 'File before 31 October; monitor intimation.', priority: 'Urgent', dueDaysBefore: 3 },
    ]
  ),

  TP_BUNDLE: dtProfile(
    'TP_BUNDLE',
    'Transfer pricing bundle',
    'TP documentation: ITR with 3CEB, Form 3CEAA, and international transaction disclosures.',
    'Income Tax Act — Sections 92 to 92F; Rules 10A to 10TH',
    'Entities with international or specified domestic transactions.',
    [
      'Related-party transaction matrix and pricing policies?',
      'Country-by-country reporting applicability?',
      'Advance pricing agreement (APA) in place?',
    ],
    [
      req('tp_matrix', 'client_document', 'International transaction matrix', 'Party-wise amounts, nature, and TP method.', ['data_checklist', 'client_portal']),
      req('tp_3ceb', 'client_document', 'Form 3CEB support data', 'Accountant certificate data for international transactions.', ['data_checklist']),
      req('tp_3ceaa', 'firm_internal', 'Form 3CEAA & ITR linkage', 'Firm prepares master file / local file summary as applicable.', ['engagement_detail']),
      req('tp_due_nov', 'statutory', 'Due date: 30 November', 'TP report and ITR due dates as notified.', ['workflow_board']),
    ],
    [
      { title: 'Related-party transaction listing' },
      { title: 'Transfer pricing study (current year)' },
      { title: 'Segmented P&L for tested parties' },
      { title: 'Inter-company agreements' },
      { title: 'Prior year 3CEB / assessment orders' },
    ],
    [
      { title: 'Update TP documentation', description: 'Benchmarking and method selection memo.', priority: 'High', dueDaysBefore: 20 },
      { title: 'Issue Form 3CEB and file TP bundle', description: 'Coordinate with accountant for 3CEB; file ITR.', priority: 'Urgent', dueDaysBefore: 5 },
    ]
  ),

  TP_STUDY: dtProfile(
    'TP_STUDY',
    'Transfer pricing study report',
    'Standalone transfer pricing documentation and benchmarking study.',
    'Income Tax Act — Section 92D; Rule 10D',
    'Entities needing TP study for compliance or planning.',
    [
      'Which transactions require benchmarking this year?',
      'Any changes to group transfer pricing policy?',
      'Comparable set and adjustment parameters approved?',
    ],
    [
      req('tp_study_data', 'client_document', 'Transaction data & agreements', 'Contracts, invoices, and margin splits.', ['data_checklist', 'client_portal']),
      req('tp_study_bench', 'firm_internal', 'Benchmarking & study report', 'Firm prepares Rule 10D documentation.', ['engagement_detail', 'documents']),
    ],
    [
      { title: 'Inter-company agreements' },
      { title: 'Transaction-wise revenue / cost break-up' },
      { title: 'Functional & risk analysis questionnaire' },
    ],
    [
      { title: 'Conduct FAR analysis', description: 'Functions, assets, and risks per entity.', priority: 'High', dueDaysBefore: 25 },
      { title: 'Issue TP study report', description: 'Partner review; share with client management.', priority: 'High', dueDaysBefore: 7 },
    ]
  ),

  NOTICES: dtProfile(
    'NOTICES',
    'Notices & assessments',
    'Representation before Income Tax authorities for notices, scrutiny, and assessments.',
    'Income Tax Act — Chapter XIV / XIV-B',
    'Any assessee receiving notice under scrutiny, reassessment, or appeal.',
    [
      'Copy of notice and due date for response?',
      'Issues raised — specific sections / years?',
      'Prior submissions and assessment history?',
    ],
    [
      req('notice_copy', 'client_document', 'Notice / order copy', 'Full notice with DIN and jurisdictional details.', ['data_checklist', 'client_portal', 'documents']),
      req('notice_records', 'client_document', 'Relevant year records', 'ITR, computation, audit report, and submissions for year under dispute.', ['data_checklist']),
      req('notice_reply', 'firm_internal', 'Reply / representation draft', 'Firm drafts response; Partner approves.', ['engagement_detail', 'approvals', 'messages']),
    ],
    [
      { title: 'Notice / order scanned copy' },
      { title: 'Original return & computation (relevant AY)' },
      { title: 'Supporting documents for disputed issues' },
      { title: 'Prior correspondence with department' },
    ],
    [
      { title: 'Analyse notice issues and risk', description: 'Map to records; identify gaps.', priority: 'Urgent', dueDaysBefore: 5 },
      { title: 'Draft and file reply', description: 'Meet statutory timeline; obtain client authorisation.', priority: 'Urgent', dueDaysBefore: 1 },
    ]
  ),

  DEPT_FOLLOWUP: dtProfile(
    'DEPT_FOLLOWUP',
    'Departmental follow-up',
    'Ongoing follow-up with Income Tax Department — rectification, appeals, refunds.',
    'Income Tax Act — various remedial provisions',
    'Assessees with pending orders, refunds, or compliance follow-ups.',
    [
      'Current status on portal (refund, appeal, rectification)?',
      'Outstanding demands or adjustments?',
      'Authorisation for firm to represent?',
    ],
    [
      req('followup_portal', 'client_information', 'Portal status screenshot', 'Refund bank status, appeal number, or demand ledger.', ['client_portal', 'messages']),
      req('followup_auth', 'client_document', 'Power of attorney / authorisation', 'If firm represents before authorities.', ['data_checklist', 'client_master'], false),
      req('followup_log', 'firm_internal', 'Follow-up register', 'Firm maintains chronology in engagement notes.', ['engagement_detail', 'messages']),
    ],
    [
      { title: 'Authorisation letter (if representation needed)' },
      { title: 'Prior orders and submissions' },
      { title: 'Demand / refund ledger from portal' },
    ],
    [
      { title: 'Review portal status and next action', description: 'Update client via engagement chat.', priority: 'Normal', dueDaysBefore: 7 },
    ]
  ),

  GSTR_1: idtProfile(
    'GSTR_1',
    'GSTR-1 outward supply return',
    'Monthly / QRMP outward supply declaration in GSTR-1.',
    'CGST Act — Section 37; GSTR-1 rules',
    'All regular GST registrants (monthly or QRMP).',
    [
      'B2B vs B2C split and e-invoice IRN coverage?',
      'Credit / debit notes and amendments from prior periods?',
      'Exports, SEZ, and deemed export supplies?',
    ],
    [
      req('g1_sales', 'client_document', 'Sales register for tax period', 'Invoice-wise with GSTIN, HSN, taxable value, and tax.', ['data_checklist', 'client_portal']),
      req('g1_einv', 'client_document', 'E-invoice IRN log', 'IRN and QR codes for applicable invoices.', ['data_checklist'], false),
      req('g1_json', 'firm_internal', 'GSTR-1 JSON & filing', 'Firm validates JSON and files; shares ARN.', ['engagement_detail', 'workflow_board']),
      req('g1_due', 'statutory', 'Client data deadline: 1st of month', 'Firm filing per GST due dates for the period.', ['workflow_board']),
    ],
    [
      { title: 'Sales register (tax period)' },
      { title: 'E-invoice IRN report (if applicable)' },
      { title: 'Credit / debit note register' },
      { title: 'Export shipping bills / BRC (if applicable)' },
    ],
    [
      { title: 'HSN summary — validate & reconcile', description: 'Compile HSN-wise taxable value and tax; match to sales register.', priority: 'High', dueDaysBefore: 6 },
      { title: 'B2B outward workings', description: 'Invoice-wise B2B data with GSTIN, place of supply, and tax split.', priority: 'High', dueDaysBefore: 5 },
      { title: 'Reconcile sales register to e-invoice / GL', description: 'Resolve mismatches before JSON.', priority: 'High', dueDaysBefore: 4 },
      { title: 'Prepare & validate GSTR-1 JSON', description: 'Generate JSON, run portal validation, fix errors.', priority: 'High', dueDaysBefore: 3 },
      { title: 'File GSTR-1 and share ARN', description: 'File on GST portal; notify client.', priority: 'Urgent', dueDaysBefore: 2 },
    ]
  ),

  GSTR_3B: idtProfile(
    'GSTR_3B',
    'GSTR-3B summary return',
    'Monthly summary return with tax liability and ITC utilisation.',
    'CGST Act — Section 39',
    'All regular GST registrants.',
    [
      'ITC eligibility and Rule 42 / 43 reversals?',
      'Cash ledger balance for payment?',
      'Any nil or late filing history affecting ITC?',
    ],
    [
      req('g3b_2b', 'client_document', 'GSTR-2B for period', 'Auto-drafted ITC statement from portal.', ['data_checklist', 'client_portal']),
      req('g3b_purchase', 'client_document', 'Purchase register', 'For ITC reconciliation with 2B.', ['data_checklist']),
      req('g3b_3b', 'firm_internal', '3B computation & payment', 'Firm computes liability, pays challan, files 3B.', ['engagement_detail', 'billing']),
      req('g3b_due', 'statutory', 'Client data deadline: 14th of month', 'Filing due per notified GST calendar.', ['workflow_board']),
    ],
    [
      { title: 'GSTR-2B download' },
      { title: 'Purchase register' },
      { title: 'Sales summary (for output tax)' },
      { title: 'Cash / credit ledger screenshot' },
      { title: 'Prior month 3B acknowledgement' },
    ],
    [
      { title: 'Download GSTR-2B & purchase reconciliation', description: 'Match 2B to purchase register; flag ineligible ITC.', priority: 'High', dueDaysBefore: 6 },
      { title: 'Output tax & ITC utilisation workings', description: 'Compute net liability from 1/3B draft data.', priority: 'High', dueDaysBefore: 4 },
      { title: 'Reconcile GSTR-2B to books', description: 'Flag ineligible ITC and mismatches.', priority: 'High', dueDaysBefore: 3 },
      { title: 'File GSTR-3B and pay liability', description: 'Client approval on cash payment amount.', priority: 'Urgent', dueDaysBefore: 2 },
    ]
  ),

  GST_MONTHLY_RETURNS: idtProfile(
    'GST_MONTHLY_RETURNS',
    'GST Monthly Returns (GSTR-1 & 3B)',
    'Single recurring monthly engagement covering both GSTR-1 (outward supplies) and GSTR-3B (summary return).',
    'CGST Act — Sections 37 & 39',
    'All regular GST registrants filing monthly returns.',
    [
      'B2B vs B2C split and e-invoice IRN coverage?',
      'ITC eligibility and Rule 42 / 43 reversals?',
      'Cash ledger balance for 3B payment?',
    ],
    [
      req('gmr_sales', 'client_document', 'Sales register for tax period', 'Invoice-wise with GSTIN, HSN, taxable value, and tax.', ['data_checklist', 'client_portal']),
      req('gmr_einv', 'client_document', 'E-invoice IRN log', 'IRN and QR codes for applicable invoices.', ['data_checklist'], false),
      req('gmr_2b', 'client_document', 'GSTR-2B for period', 'Auto-drafted ITC statement from portal.', ['data_checklist', 'client_portal']),
      req('gmr_purchase', 'client_document', 'Purchase register', 'For ITC reconciliation with 2B.', ['data_checklist']),
      req('gmr_file', 'firm_internal', 'GSTR-1 & 3B filing', 'Firm validates JSON, files both returns, shares ARNs.', ['engagement_detail', 'workflow_board', 'billing']),
      req('gmr_due', 'statutory', 'Filing due per GST calendar', 'GSTR-1 by 11th, GSTR-3B by 20th (or QRMP dates).', ['workflow_board']),
    ],
    [
      { title: 'Sales register (tax period)' },
      { title: 'E-invoice IRN report (if applicable)' },
      { title: 'Credit / debit note register' },
      { title: 'GSTR-2B download' },
      { title: 'Purchase register' },
      { title: 'Cash / credit ledger screenshot' },
    ],
    [
      { title: 'HSN summary — validate & reconcile', description: 'Compile HSN-wise taxable value and tax; match to sales register.', priority: 'High', dueDaysBefore: 9 },
      { title: 'B2B outward workings', description: 'Invoice-wise B2B data with GSTIN, place of supply, and tax split.', priority: 'High', dueDaysBefore: 8 },
      { title: 'Prepare, validate & file GSTR-1', description: 'Generate JSON, run portal validation, file and share ARN.', priority: 'Urgent', dueDaysBefore: 7 },
      { title: 'Download GSTR-2B & purchase reconciliation', description: 'Match 2B to purchase register; flag ineligible ITC.', priority: 'High', dueDaysBefore: 5 },
      { title: 'Output tax & ITC utilisation workings', description: 'Compute net liability from GSTR-1 and 2B data.', priority: 'High', dueDaysBefore: 4 },
      { title: 'File GSTR-3B and pay liability', description: 'Client approval on cash payment amount; file and archive ARN.', priority: 'Urgent', dueDaysBefore: 2 },
    ]
  ),

  GST_NOTICES: idtProfile(
    'GST_NOTICES',
    'GST notices & adjudication',
    'Reply to GST notices, DRC-01, audits, and appeals.',
    'CGST Act — Sections 73, 74, 107',
    'Registrants with department notices or audit selections.',
    [
      'Notice type — scrutiny, audit, DRC, or appeal?',
      'Tax period and alleged difference amount?',
      'Electronic credit ledger / cash ledger position?',
    ],
    [
      req('gst_notice', 'client_document', 'GST notice copy', 'Full notice with reference number and due date.', ['data_checklist', 'client_portal', 'documents']),
      req('gst_records', 'client_document', 'Period GST returns & reconciliations', 'GSTR-1, 3B, 2B, and annual reconciliation for period.', ['data_checklist']),
      req('gst_reply', 'firm_internal', 'Reply drafting & hearing prep', 'Firm drafts reply; Partner reviews.', ['engagement_detail', 'approvals']),
    ],
    [
      { title: 'GST notice / order copy' },
      { title: 'Returns JSON for disputed period' },
      { title: 'Reconciliation statement (GSTR-9 / 9C if available)' },
      { title: 'Prior replies and acknowledgements' },
    ],
    [
      { title: 'Analyse notice and quantify exposure', description: 'Interest and penalty scenarios.', priority: 'Urgent', dueDaysBefore: 5 },
      { title: 'File reply before due date', description: 'Upload on GST portal; attend hearing if listed.', priority: 'Urgent', dueDaysBefore: 1 },
    ]
  ),

  STATUTORY_AUDIT: auditProfile(
    'STATUTORY_AUDIT',
    'Statutory audit',
    'Independent statutory audit under Companies Act 2013 with CARO and IND AS / Schedule III reporting.',
    'Companies Act, 2013 — Section 143; SA 200–810; CARO 2020',
    'Companies, LLPs, and entities requiring statutory audit.',
    [
      'Previous auditor rotation / ADT-1 status?',
      'Related parties and contingent liabilities?',
      'Going concern and subsequent events since year-end?',
    ],
    [
      req('sa_tb', 'client_document', 'Trial balance & ledgers', 'Complete books for the financial year.', ['data_checklist', 'client_portal']),
      req('sa_bank', 'client_document', 'Bank confirmations & statements', 'All operative and loan accounts.', ['data_checklist']),
      req('sa_assets', 'client_document', 'Fixed assets & inventory', 'Registers, physical verification, and valuation.', ['data_checklist']),
      req('sa_py', 'client_document', 'Prior year audit report', 'Signed report and management letter.', ['data_checklist']),
      req('sa_draft', 'firm_internal', 'Audit working papers & draft report', 'Firm executes SA program; Manager and Partner review.', ['engagement_detail', 'workpapers', 'workflow_board']),
      req('sa_udin', 'firm_internal', 'UDIN on audit report', 'Generate UDIN before signing auditor report.', ['approvals', 'workflow_board']),
    ],
    [
      { title: 'Trial Balance' },
      { title: 'Bank Statements (all accounts)' },
      { title: 'Fixed Asset Register' },
      { title: 'Stock / inventory statement' },
      { title: 'Loan agreements & sanctions' },
      { title: 'Board minutes & resolutions' },
      { title: 'Previous year audit report' },
      { title: 'Related-party transaction list' },
    ],
    [
      { title: 'Planning memorandum & risk assessment', description: 'SA 315 entity and environment understanding.', priority: 'High', dueDaysBefore: 25 },
      { title: 'Substantive fieldwork & sampling', description: 'Complete audit program sections.', priority: 'High', dueDaysBefore: 12 },
      { title: 'Draft audit report & CARO', description: 'Manager review then Partner review.', priority: 'High', dueDaysBefore: 7 },
      { title: 'UDIN and issue signed report', description: 'File with ROC / provide to client for AGM.', priority: 'Urgent', dueDaysBefore: 3 },
    ]
  ),

  TAX_AUDIT_44AB: auditProfile(
    'TAX_AUDIT_44AB',
    'Tax audit u/s 44AB',
    'Tax audit engagement with Form 3CD — may run parallel to statutory audit.',
    'Income Tax Act — Section 44AB',
    'Assessees crossing 44AB thresholds.',
    [
      'Separate engagement letter for tax audit?',
      'Books same as statutory audit client?',
      'All 3CD clauses identified as applicable?',
    ],
    [
      req('ta44_books', 'client_document', 'Books of account', 'Complete ledgers for the previous year.', ['data_checklist', 'client_portal']),
      req('ta44_3cd', 'client_document', '3CD information schedule', 'Management fills clause-wise questionnaire.', ['data_checklist']),
      req('ta44_sign', 'firm_internal', 'Sign tax audit report with UDIN', 'Partner sign-off; furnish to client.', ['engagement_detail', 'approvals']),
    ],
    [
      { title: 'Trial balance & books of account' },
      { title: 'Form 3CD data schedule (management)' },
      { title: 'TDS / GST annual summaries' },
      { title: 'Prior year 3CD (if any)' },
    ],
    [
      { title: 'Complete Form 3CD clauses', description: 'Document applicability per clause.', priority: 'High', dueDaysBefore: 14 },
      { title: 'UDIN and file tax audit report', description: 'Coordinate with ITR filing timeline.', priority: 'Urgent', dueDaysBefore: 3 },
    ]
  ),
};

export function normalizeServiceCode(code: string): string {
  return code.trim().toUpperCase();
}

export function getServiceProfile(serviceCode: string | null | undefined): ServiceProfile | null {
  if (!serviceCode) return null;
  return SERVICE_PROFILES[normalizeServiceCode(serviceCode)] ?? null;
}

export function getChecklistForService(serviceCode: string | null | undefined, engagementType: string): { title: string; description?: string }[] {
  const profile = getServiceProfile(serviceCode);
  if (profile?.checklistItems.length) return profile.checklistItems;
  return [];
}

export function getTasksForService(
  serviceCode: string | null | undefined,
  engagementType: string
): ServiceTaskTemplate[] {
  const profile = getServiceProfile(serviceCode);
  if (profile?.internalTasks.length) return profile.internalTasks;
  return [];
}

export function enrichServiceForCatalog(svc: { code: string; domain: WorkflowDomain; name: string; dueRule?: string; recurrence?: string; templateId: string }) {
  const profile = getServiceProfile(svc.code);
  return {
    ...svc,
    summary: profile?.summary ?? '',
    authority: profile?.authority ?? '',
    applicability: profile?.applicability ?? '',
    firmWillAsk: profile?.firmWillAsk ?? [],
    requirementCount: profile?.requirements.length ?? 0,
    clientDocumentCount: profile?.requirements.filter((r) => r.category === 'client_document').length ?? 0,
  };
}

export function serviceRequirementDetail(serviceCode: string) {
  const profile = getServiceProfile(serviceCode);
  if (!profile) return null;
  const byCategory = (['client_document', 'client_information', 'firm_internal', 'statutory'] as RequirementCategory[]).map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: profile.requirements.filter((r) => r.category === cat),
  }));
  const surfaces = [...new Set(profile.requirements.flatMap((r) => r.surfaces))].map((s) => ({
    surface: s,
    label: APP_SURFACE_LABELS[s],
  }));
  return {
    ...profile,
    byCategory,
    surfaces,
    checklistItems: profile.checklistItems,
    internalTasks: profile.internalTasks,
  };
}
