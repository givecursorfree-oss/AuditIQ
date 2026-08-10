export const MKD_CLIENT_SERVICES = [
  { code: 'ITR_JULY', label: 'Income Tax Return', description: 'Individual or business ITR filing', group: 'Direct Tax' },
  { code: 'TAX_AUDIT_44AB', label: 'Tax audit u/s 44AB', description: 'Mandatory tax audit under the Income Tax Act', group: 'Audit' },
  { code: 'STATUTORY_AUDIT', label: 'Statutory audit', description: 'Companies Act audit and financial statements', group: 'Audit' },
  { code: 'GST_MONTHLY_RETURNS', label: 'GST Monthly Returns', description: 'GSTR-1 & GSTR-3B — single monthly engagement', group: 'GST' },
  { code: 'GSTR_1', label: 'GSTR-1', description: 'Outward supplies return — monthly', group: 'GST' },
  { code: 'GSTR_3B', label: 'GSTR-3B', description: 'Summary return — monthly', group: 'GST' },
  { code: 'GST_NOTICES', label: 'GST notices & assessments', description: 'Department notices and replies', group: 'GST' },
  { code: 'TDS_REMITTANCE', label: 'TDS remittance', description: 'Monthly deduction and deposit', group: 'Direct Tax' },
  { code: 'TDS_QUARTERLY', label: 'TDS quarterly return', description: 'Quarterly TDS statements', group: 'Direct Tax' },
  { code: 'ADVANCE_TAX', label: 'Advance tax', description: 'Quarterly advance tax compliance', group: 'Direct Tax' },
  { code: 'TP_STUDY', label: 'Transfer pricing study', description: 'Annual TP documentation', group: 'Direct Tax' },
];

export const REQ_STEP_LABELS = ['Select services', 'Details', 'Review'];

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth();
const startYear = currentMonth < 3 ? currentYear - 1 : currentYear;

export const FY_OPTIONS = [
  `FY ${startYear}-${(startYear + 1).toString().slice(2)}`,
  `FY ${startYear - 1}-${(startYear).toString().slice(2)}`,
  `FY ${startYear - 2}-${(startYear - 1).toString().slice(2)}`,
  'Other',
];

export const CLIENT_PORTAL_TABS = new Set([
  'tracking',
  'engagements',
  'documents',
  'requests',
  'invoices',
  'reports',
  'queries',
  'settings',
]);
