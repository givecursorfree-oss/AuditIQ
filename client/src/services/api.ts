import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auditiq_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If we're using the mock token, return realistic demo data
    const token = localStorage.getItem('auditiq_token');
    if (token === 'mock_jwt_token_demo') {
      const url = error.config?.url || '';
      return Promise.resolve({ data: getDemoData(url) });
    }

    // Treat 401 or 500 as error, but don't redirect to login if we are already trying to login
    if (error.response?.status === 401 && !error.config.url?.includes('/auth/login') && !error.config.url?.includes('/auth/register')) {
      localStorage.removeItem('auditiq_token');
      localStorage.removeItem('auditiq_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Demo Data for Mock Mode ───
function getDemoData(url: string) {
  // Dashboard
  if (url === '/dashboard') return DEMO.dashboard;
  if (url.includes('/dashboard/deadlines')) return DEMO.deadlines;
  if (url.includes('/dashboard/chart-data')) return DEMO.chartData;

  // Engagements
  if (url.includes('/engagements') && !url.includes('/')) return { engagements: DEMO.engagements, total: DEMO.engagements.length };
  if (url.includes('/engagements')) return { engagements: DEMO.engagements, total: DEMO.engagements.length };

  // Workpapers
  if (url.includes('/workpapers')) return DEMO.workpapers;

  // Documents
  if (url.includes('/documents')) return DEMO.documents;

  // Attendance
  if (url.includes('/attendance/summary')) return DEMO.attendanceSummary;
  if (url.includes('/attendance/leaves')) return DEMO.leaves;
  if (url.includes('/attendance')) return DEMO.attendance;

  // Reports
  if (url.includes('/reports/observations')) return DEMO.observations;
  if (url.includes('/reports/form3cd')) return DEMO.form3cd;
  if (url.includes('/reports')) return DEMO.reports;

  // Admin
  if (url.includes('/admin/users')) return DEMO.users;
  if (url.includes('/admin/roles')) return DEMO.roles;
  if (url.includes('/admin/firm')) return DEMO.firm;
  if (url.includes('/admin/audit-log')) return DEMO.auditLog;

  // Notifications
  if (url.includes('/notifications/unread-count')) return { count: 5 };

  // Copilot
  if (url.includes('/copilot/sessions')) return [];

  return {};
}

const DEMO = {
  // ─── Dashboard ───
  dashboard: {
    stats: {
      totalClients: 24,
      totalEngagements: 38,
      activeEngagements: 12,
      overdueDeadlines: 3,
      teamMembers: 15,
      monthlyHours: 186,
    },
    engagementsByStatus: {
      Planning: 4,
      Fieldwork: 5,
      Review: 3,
      Completed: 18,
      Archived: 8,
    },
    engagementsByType: {
      Statutory: 15,
      'Tax (44AB)': 10,
      GST: 6,
      Internal: 4,
      Special: 3,
    },
    activeEngagements: [
      { id: 'eng-1', title: 'Statutory Audit FY 2024-25', type: 'Statutory', status: 'Fieldwork', financialYear: '2024-25', startDate: '2025-04-01', deadline: '2025-09-30', progress: 65, clientId: 'cl-1', client: { name: 'Reliance Industries Ltd' }, members: [{ id: 'm1', userId: 'u1', engagementId: 'eng-1', role: 'Partner', user: { firstName: 'Rajesh', lastName: 'Sharma', initials: 'RS' } }], _count: { workpapers: 12, documents: 28, observations: 3 }, createdAt: '2025-04-01T00:00:00Z', updatedAt: '2025-06-15T00:00:00Z' },
      { id: 'eng-2', title: 'Tax Audit u/s 44AB', type: 'Tax (44AB)', status: 'Planning', financialYear: '2024-25', startDate: '2025-05-01', deadline: '2025-09-30', progress: 20, clientId: 'cl-2', client: { name: 'Tata Consultancy Services' }, members: [{ id: 'm2', userId: 'u2', engagementId: 'eng-2', role: 'Manager', user: { firstName: 'Priya', lastName: 'Patel', initials: 'PP' } }], _count: { workpapers: 4, documents: 10, observations: 0 }, createdAt: '2025-05-01T00:00:00Z', updatedAt: '2025-06-10T00:00:00Z' },
      { id: 'eng-3', title: 'GST Compliance Review', type: 'GST', status: 'Review', financialYear: '2024-25', startDate: '2025-03-15', deadline: '2025-07-31', progress: 85, clientId: 'cl-3', client: { name: 'Infosys Ltd' }, members: [{ id: 'm3', userId: 'u3', engagementId: 'eng-3', role: 'Staff', user: { firstName: 'Amit', lastName: 'Kumar', initials: 'AK' } }], _count: { workpapers: 8, documents: 15, observations: 2 }, createdAt: '2025-03-15T00:00:00Z', updatedAt: '2025-06-12T00:00:00Z' },
      { id: 'eng-4', title: 'Internal Audit Q1 2025-26', type: 'Internal', status: 'Fieldwork', financialYear: '2025-26', startDate: '2025-04-15', deadline: '2025-06-30', progress: 50, clientId: 'cl-4', client: { name: 'HDFC Bank Ltd' }, members: [{ id: 'm4', userId: 'u4', engagementId: 'eng-4', role: 'Partner', user: { firstName: 'Neha', lastName: 'Gupta', initials: 'NG' } }], _count: { workpapers: 6, documents: 12, observations: 1 }, createdAt: '2025-04-15T00:00:00Z', updatedAt: '2025-06-14T00:00:00Z' },
      { id: 'eng-5', title: 'Statutory Audit FY 2024-25', type: 'Statutory', status: 'Fieldwork', financialYear: '2024-25', startDate: '2025-04-01', deadline: '2025-09-30', progress: 40, clientId: 'cl-5', client: { name: 'Wipro Technologies' }, members: [{ id: 'm5', userId: 'u5', engagementId: 'eng-5', role: 'Manager', user: { firstName: 'Sanjay', lastName: 'Mehta', initials: 'SM' } }], _count: { workpapers: 9, documents: 20, observations: 4 }, createdAt: '2025-04-01T00:00:00Z', updatedAt: '2025-06-13T00:00:00Z' },
    ],
    recentActivity: [
      { id: 'act-1', action: 'uploaded document', entity: 'Balance Sheet - Reliance Industries', user: { firstName: 'Rajesh', lastName: 'Sharma', initials: 'RS' }, createdAt: '2025-06-15T14:30:00Z' },
      { id: 'act-2', action: 'completed workpaper', entity: 'Revenue Recognition Testing', user: { firstName: 'Priya', lastName: 'Patel', initials: 'PP' }, createdAt: '2025-06-15T12:15:00Z' },
      { id: 'act-3', action: 'raised observation', entity: 'Inventory Valuation Discrepancy', user: { firstName: 'Amit', lastName: 'Kumar', initials: 'AK' }, createdAt: '2025-06-15T10:45:00Z' },
      { id: 'act-4', action: 'approved workpaper', entity: 'Cash & Bank Verification', user: { firstName: 'Neha', lastName: 'Gupta', initials: 'NG' }, createdAt: '2025-06-14T18:20:00Z' },
      { id: 'act-5', action: 'created engagement', entity: 'Tax Audit - TCS FY 2024-25', user: { firstName: 'Sanjay', lastName: 'Mehta', initials: 'SM' }, createdAt: '2025-06-14T16:00:00Z' },
      { id: 'act-6', action: 'submitted leave request', entity: '2 days Casual Leave', user: { firstName: 'Deepa', lastName: 'Nair', initials: 'DN' }, createdAt: '2025-06-14T11:30:00Z' },
      { id: 'act-7', action: 'reviewed report', entity: 'CARO 2020 Report - HDFC Bank', user: { firstName: 'Rajesh', lastName: 'Sharma', initials: 'RS' }, createdAt: '2025-06-13T17:45:00Z' },
      { id: 'act-8', action: 'updated Form 3CD', entity: 'Clause 21 - Infosys GST Audit', user: { firstName: 'Priya', lastName: 'Patel', initials: 'PP' }, createdAt: '2025-06-13T15:00:00Z' },
    ],
  },

  // ─── Deadlines ───
  deadlines: [
    { id: 'dl-1', title: 'Statutory Audit Report - Reliance', dueDate: '2025-09-30T00:00:00Z', type: 'Filing', completed: false, isOverdue: false, daysRemaining: 45, engagement: { title: 'Statutory Audit FY 2024-25', client: { name: 'Reliance Industries Ltd' } }, engagementId: 'eng-1' },
    { id: 'dl-2', title: 'Tax Audit Report u/s 44AB - TCS', dueDate: '2025-09-30T00:00:00Z', type: 'Filing', completed: false, isOverdue: false, daysRemaining: 45, engagement: { title: 'Tax Audit u/s 44AB', client: { name: 'Tata Consultancy Services' } }, engagementId: 'eng-2' },
    { id: 'dl-3', title: 'GSTR-9 Annual Return - Infosys', dueDate: '2025-06-20T00:00:00Z', type: 'GST', completed: false, isOverdue: true, daysRemaining: -5, engagement: { title: 'GST Compliance Review', client: { name: 'Infosys Ltd' } }, engagementId: 'eng-3' },
    { id: 'dl-4', title: 'Internal Audit Report Q1 - HDFC', dueDate: '2025-06-30T00:00:00Z', type: 'Reporting', completed: false, isOverdue: false, daysRemaining: 15, engagement: { title: 'Internal Audit Q1 2025-26', client: { name: 'HDFC Bank Ltd' } }, engagementId: 'eng-4' },
    { id: 'dl-5', title: 'Form 3CEB - Transfer Pricing', dueDate: '2025-11-30T00:00:00Z', type: 'Filing', completed: false, isOverdue: false, daysRemaining: 168, engagement: { title: 'Statutory Audit FY 2024-25', client: { name: 'Wipro Technologies' } }, engagementId: 'eng-5' },
    { id: 'dl-6', title: 'CARO 2020 Report - Reliance', dueDate: '2025-06-18T00:00:00Z', type: 'Reporting', completed: false, isOverdue: true, daysRemaining: -2, engagement: { title: 'Statutory Audit FY 2024-25', client: { name: 'Reliance Industries Ltd' } }, engagementId: 'eng-1' },
  ],

  // ─── Chart Data ───
  chartData: [
    { month: 'Jan', active: 8, completed: 3 },
    { month: 'Feb', active: 10, completed: 5 },
    { month: 'Mar', active: 12, completed: 4 },
    { month: 'Apr', active: 15, completed: 6 },
    { month: 'May', active: 14, completed: 8 },
    { month: 'Jun', active: 12, completed: 10 },
  ],

  // ─── Engagements ───
  engagements: [
    { id: 'eng-1', title: 'Statutory Audit FY 2024-25', type: 'Statutory', status: 'Fieldwork', financialYear: '2024-25', startDate: '2025-04-01', deadline: '2025-09-30', billingType: 'Fixed', billingAmount: 1500000, progress: 65, clientId: 'cl-1', client: { id: 'cl-1', name: 'Reliance Industries Ltd', code: 'RIL', pan: 'AABCR1234A', entityType: 'Listed Company', industry: 'Conglomerate', isActive: true, createdAt: '2024-01-15T00:00:00Z' }, members: [{ id: 'm1', userId: 'u1', engagementId: 'eng-1', role: 'Engagement Partner', user: { firstName: 'Rajesh', lastName: 'Sharma', initials: 'RS' } }, { id: 'm2', userId: 'u2', engagementId: 'eng-1', role: 'Audit Manager', user: { firstName: 'Priya', lastName: 'Patel', initials: 'PP' } }], _count: { workpapers: 12, documents: 28, observations: 3 }, createdAt: '2025-04-01T00:00:00Z', updatedAt: '2025-06-15T00:00:00Z' },
    { id: 'eng-2', title: 'Tax Audit u/s 44AB - TCS', type: 'Tax (44AB)', status: 'Planning', financialYear: '2024-25', startDate: '2025-05-01', deadline: '2025-09-30', billingType: 'Fixed', billingAmount: 800000, progress: 20, clientId: 'cl-2', client: { id: 'cl-2', name: 'Tata Consultancy Services', code: 'TCS', pan: 'AABCT5678B', entityType: 'Listed Company', industry: 'IT Services', isActive: true, createdAt: '2024-02-10T00:00:00Z' }, members: [{ id: 'm3', userId: 'u2', engagementId: 'eng-2', role: 'Audit Manager', user: { firstName: 'Priya', lastName: 'Patel', initials: 'PP' } }], _count: { workpapers: 4, documents: 10, observations: 0 }, createdAt: '2025-05-01T00:00:00Z', updatedAt: '2025-06-10T00:00:00Z' },
    { id: 'eng-3', title: 'GST Compliance Review - Infosys', type: 'GST', status: 'Review', financialYear: '2024-25', startDate: '2025-03-15', deadline: '2025-07-31', billingType: 'Hourly', billingAmount: 500000, progress: 85, clientId: 'cl-3', client: { id: 'cl-3', name: 'Infosys Ltd', code: 'INFY', pan: 'AABCI9012C', entityType: 'Listed Company', industry: 'IT Services', isActive: true, createdAt: '2024-03-05T00:00:00Z' }, members: [{ id: 'm4', userId: 'u3', engagementId: 'eng-3', role: 'Senior Auditor', user: { firstName: 'Amit', lastName: 'Kumar', initials: 'AK' } }], _count: { workpapers: 8, documents: 15, observations: 2 }, createdAt: '2025-03-15T00:00:00Z', updatedAt: '2025-06-12T00:00:00Z' },
    { id: 'eng-4', title: 'Internal Audit Q1 - HDFC Bank', type: 'Internal', status: 'Fieldwork', financialYear: '2025-26', startDate: '2025-04-15', deadline: '2025-06-30', billingType: 'Fixed', billingAmount: 1200000, progress: 50, clientId: 'cl-4', client: { id: 'cl-4', name: 'HDFC Bank Ltd', code: 'HDFC', pan: 'AABCH3456D', entityType: 'Listed Company', industry: 'Banking', isActive: true, createdAt: '2024-01-20T00:00:00Z' }, members: [{ id: 'm5', userId: 'u4', engagementId: 'eng-4', role: 'Engagement Partner', user: { firstName: 'Neha', lastName: 'Gupta', initials: 'NG' } }, { id: 'm6', userId: 'u5', engagementId: 'eng-4', role: 'Audit Manager', user: { firstName: 'Sanjay', lastName: 'Mehta', initials: 'SM' } }], _count: { workpapers: 6, documents: 12, observations: 1 }, createdAt: '2025-04-15T00:00:00Z', updatedAt: '2025-06-14T00:00:00Z' },
    { id: 'eng-5', title: 'Statutory Audit FY 2024-25 - Wipro', type: 'Statutory', status: 'Fieldwork', financialYear: '2024-25', startDate: '2025-04-01', deadline: '2025-09-30', billingType: 'Fixed', billingAmount: 1000000, progress: 40, clientId: 'cl-5', client: { id: 'cl-5', name: 'Wipro Technologies', code: 'WIPRO', pan: 'AABCW7890E', entityType: 'Listed Company', industry: 'IT Services', isActive: true, createdAt: '2024-04-01T00:00:00Z' }, members: [{ id: 'm7', userId: 'u5', engagementId: 'eng-5', role: 'Audit Manager', user: { firstName: 'Sanjay', lastName: 'Mehta', initials: 'SM' } }], _count: { workpapers: 9, documents: 20, observations: 4 }, createdAt: '2025-04-01T00:00:00Z', updatedAt: '2025-06-13T00:00:00Z' },
    { id: 'eng-6', title: 'Special Audit - Adani Enterprises', type: 'Special', status: 'Completed', financialYear: '2024-25', startDate: '2025-01-15', deadline: '2025-05-31', billingType: 'Fixed', billingAmount: 2000000, progress: 100, clientId: 'cl-6', client: { id: 'cl-6', name: 'Adani Enterprises Ltd', code: 'ADANI', pan: 'AABCA1234F', entityType: 'Listed Company', industry: 'Conglomerate', isActive: true, createdAt: '2024-05-15T00:00:00Z' }, members: [{ id: 'm8', userId: 'u1', engagementId: 'eng-6', role: 'Engagement Partner', user: { firstName: 'Rajesh', lastName: 'Sharma', initials: 'RS' } }], _count: { workpapers: 15, documents: 35, observations: 5 }, createdAt: '2025-01-15T00:00:00Z', updatedAt: '2025-05-28T00:00:00Z' },
  ],

  // ─── Workpapers ───
  workpapers: [
    { id: 'wp-1', title: 'Revenue Recognition Testing', reference: 'WP-RIL-001', type: 'Substantive', section: 'Revenue', status: 'Approved', engagementId: 'eng-1', preparedById: 'u2', preparedBy: { firstName: 'Priya', lastName: 'Patel', initials: 'PP' }, auditSteps: [{ id: 'as-1', stepNumber: 1, description: 'Verify revenue cut-off procedures', isCompleted: true }, { id: 'as-2', stepNumber: 2, description: 'Test sample of sales invoices against dispatch records', isCompleted: true }, { id: 'as-3', stepNumber: 3, description: 'Confirm major receivables with debtors', isCompleted: true }], _count: { auditSteps: 3, reviewComments: 1, signoffs: 2 }, createdAt: '2025-04-10T00:00:00Z', updatedAt: '2025-06-10T00:00:00Z' },
    { id: 'wp-2', title: 'Cash & Bank Verification', reference: 'WP-RIL-002', type: 'Substantive', section: 'Cash & Bank', status: 'Reviewed', engagementId: 'eng-1', preparedById: 'u3', preparedBy: { firstName: 'Amit', lastName: 'Kumar', initials: 'AK' }, auditSteps: [{ id: 'as-4', stepNumber: 1, description: 'Obtain bank confirmation letters', isCompleted: true }, { id: 'as-5', stepNumber: 2, description: 'Prepare bank reconciliation statement', isCompleted: true }, { id: 'as-6', stepNumber: 3, description: 'Verify fixed deposits and interest accruals', isCompleted: false }], _count: { auditSteps: 3, reviewComments: 2, signoffs: 1 }, createdAt: '2025-04-12T00:00:00Z', updatedAt: '2025-06-12T00:00:00Z' },
    { id: 'wp-3', title: 'Inventory Valuation & Existence', reference: 'WP-RIL-003', type: 'Substantive', section: 'Inventory', status: 'Under Review', engagementId: 'eng-1', preparedById: 'u3', preparedBy: { firstName: 'Amit', lastName: 'Kumar', initials: 'AK' }, auditSteps: [{ id: 'as-7', stepNumber: 1, description: 'Attend physical stock verification', isCompleted: true }, { id: 'as-8', stepNumber: 2, description: 'Verify inventory valuation per AS-2/Ind AS 2', isCompleted: true }, { id: 'as-9', stepNumber: 3, description: 'Check NRV adjustments and slow-moving provisions', isCompleted: false }], _count: { auditSteps: 3, reviewComments: 0, signoffs: 0 }, createdAt: '2025-04-20T00:00:00Z', updatedAt: '2025-06-14T00:00:00Z' },
    { id: 'wp-4', title: 'Fixed Assets & Depreciation', reference: 'WP-RIL-004', type: 'Substantive', section: 'Fixed Assets', status: 'Prepared', engagementId: 'eng-1', preparedById: 'u2', preparedBy: { firstName: 'Priya', lastName: 'Patel', initials: 'PP' }, auditSteps: [{ id: 'as-10', stepNumber: 1, description: 'Verify additions/disposals during the year', isCompleted: true }, { id: 'as-11', stepNumber: 2, description: 'Recalculate depreciation per Schedule II', isCompleted: false }], _count: { auditSteps: 2, reviewComments: 0, signoffs: 0 }, createdAt: '2025-05-05T00:00:00Z', updatedAt: '2025-06-11T00:00:00Z' },
    { id: 'wp-5', title: 'Trade Receivables Confirmation', reference: 'WP-TCS-001', type: 'Substantive', section: 'Receivables', status: 'Draft', engagementId: 'eng-2', preparedById: 'u3', preparedBy: { firstName: 'Amit', lastName: 'Kumar', initials: 'AK' }, auditSteps: [{ id: 'as-12', stepNumber: 1, description: 'Send balance confirmation to major debtors', isCompleted: false }], _count: { auditSteps: 1, reviewComments: 0, signoffs: 0 }, createdAt: '2025-05-20T00:00:00Z', updatedAt: '2025-05-20T00:00:00Z' },
    { id: 'wp-6', title: 'GST Input Tax Credit Reconciliation', reference: 'WP-INFY-001', type: 'Compliance', section: 'GST', status: 'Reviewed', engagementId: 'eng-3', preparedById: 'u3', preparedBy: { firstName: 'Amit', lastName: 'Kumar', initials: 'AK' }, auditSteps: [{ id: 'as-13', stepNumber: 1, description: 'Reconcile GSTR-2A/2B with purchase register', isCompleted: true }, { id: 'as-14', stepNumber: 2, description: 'Verify ITC reversals u/s 17(5)', isCompleted: true }], _count: { auditSteps: 2, reviewComments: 1, signoffs: 1 }, createdAt: '2025-04-01T00:00:00Z', updatedAt: '2025-06-08T00:00:00Z' },
  ],

  // ─── Documents ───
  documents: [
    { id: 'doc-1', fileName: 'balance-sheet-ril-fy25.pdf', originalName: 'Balance Sheet - Reliance Industries FY25.pdf', mimeType: 'application/pdf', size: 2450000, category: 'Financial Statements', folder: 'Reliance Industries', version: 1, engagementId: 'eng-1', uploadedBy: { firstName: 'Rajesh', lastName: 'Sharma', initials: 'RS' }, createdAt: '2025-05-10T00:00:00Z' },
    { id: 'doc-2', fileName: 'trial-balance-ril-mar25.xlsx', originalName: 'Trial Balance - RIL March 2025.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 890000, category: 'Working Papers', folder: 'Reliance Industries', version: 2, engagementId: 'eng-1', uploadedBy: { firstName: 'Priya', lastName: 'Patel', initials: 'PP' }, createdAt: '2025-05-12T00:00:00Z' },
    { id: 'doc-3', fileName: 'bank-confirmation-sbi.pdf', originalName: 'Bank Confirmation Letter - SBI.pdf', mimeType: 'application/pdf', size: 450000, category: 'Confirmations', folder: 'Reliance Industries', version: 1, engagementId: 'eng-1', uploadedBy: { firstName: 'Amit', lastName: 'Kumar', initials: 'AK' }, createdAt: '2025-05-15T00:00:00Z' },
    { id: 'doc-4', fileName: 'form-26as-tcs-fy25.pdf', originalName: 'Form 26AS - TCS FY 2024-25.pdf', mimeType: 'application/pdf', size: 1200000, category: 'Tax Documents', folder: 'TCS', version: 1, engagementId: 'eng-2', uploadedBy: { firstName: 'Priya', lastName: 'Patel', initials: 'PP' }, createdAt: '2025-05-20T00:00:00Z' },
    { id: 'doc-5', fileName: 'gstr1-infosys-apr25.json', originalName: 'GSTR-1 Filing - Infosys April 2025.json', mimeType: 'application/json', size: 320000, category: 'GST Returns', folder: 'Infosys', version: 1, engagementId: 'eng-3', uploadedBy: { firstName: 'Amit', lastName: 'Kumar', initials: 'AK' }, createdAt: '2025-05-25T00:00:00Z' },
    { id: 'doc-6', fileName: 'board-resolution-hdfc.pdf', originalName: 'Board Resolution - HDFC Bank.pdf', mimeType: 'application/pdf', size: 180000, category: 'Corporate Records', folder: 'HDFC Bank', version: 1, engagementId: 'eng-4', uploadedBy: { firstName: 'Neha', lastName: 'Gupta', initials: 'NG' }, createdAt: '2025-04-20T00:00:00Z' },
    { id: 'doc-7', fileName: 'management-representation-ril.docx', originalName: 'Management Representation Letter - RIL.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 95000, category: 'Representations', folder: 'Reliance Industries', version: 1, engagementId: 'eng-1', uploadedBy: { firstName: 'Rajesh', lastName: 'Sharma', initials: 'RS' }, createdAt: '2025-06-01T00:00:00Z' },
    { id: 'doc-8', fileName: 'itc-reconciliation-infosys.xlsx', originalName: 'ITC Reconciliation - Infosys FY25.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 670000, category: 'Working Papers', folder: 'Infosys', version: 3, engagementId: 'eng-3', uploadedBy: { firstName: 'Amit', lastName: 'Kumar', initials: 'AK' }, createdAt: '2025-06-05T00:00:00Z' },
  ],

  // ─── Attendance ───
  attendance: [
    { id: 'att-1', date: '2025-06-16T00:00:00Z', checkIn: '2025-06-16T09:15:00Z', checkOut: '2025-06-16T18:30:00Z', hoursWorked: 9.25, status: 'Present', method: 'manual' },
    { id: 'att-2', date: '2025-06-14T00:00:00Z', checkIn: '2025-06-14T09:00:00Z', checkOut: '2025-06-14T18:00:00Z', hoursWorked: 9.0, status: 'Present', method: 'manual' },
    { id: 'att-3', date: '2025-06-13T00:00:00Z', checkIn: '2025-06-13T09:30:00Z', checkOut: '2025-06-13T19:00:00Z', hoursWorked: 9.5, status: 'Present', method: 'manual' },
    { id: 'att-4', date: '2025-06-12T00:00:00Z', checkIn: '2025-06-12T10:00:00Z', checkOut: '2025-06-12T18:45:00Z', hoursWorked: 8.75, status: 'Late', method: 'manual' },
    { id: 'att-5', date: '2025-06-11T00:00:00Z', checkIn: '2025-06-11T09:10:00Z', checkOut: '2025-06-11T18:15:00Z', hoursWorked: 9.08, status: 'Present', method: 'manual' },
  ],
  attendanceSummary: { totalDays: 22, totalHours: 186, presentDays: 20, lateDays: 2 },
  leaves: [
    { id: 'lv-1', type: 'Casual', fromDate: '2025-06-20T00:00:00Z', toDate: '2025-06-21T00:00:00Z', reason: 'Family function', status: 'Approved' },
    { id: 'lv-2', type: 'Sick', fromDate: '2025-05-05T00:00:00Z', toDate: '2025-05-05T00:00:00Z', reason: 'Not feeling well', status: 'Approved' },
    { id: 'lv-3', type: 'Earned', fromDate: '2025-07-10T00:00:00Z', toDate: '2025-07-15T00:00:00Z', reason: 'Annual vacation', status: 'Pending' },
  ],

  // ─── Reports ───
  reports: [
    { id: 'rpt-1', title: 'Independent Auditor Report - Reliance Industries FY25', type: 'Statutory Audit Report', content: '', status: 'Draft', engagementId: 'eng-1', engagement: { title: 'Statutory Audit FY 2024-25', client: { name: 'Reliance Industries Ltd' } }, createdAt: '2025-06-10T00:00:00Z' },
    { id: 'rpt-2', title: 'CARO 2020 Report - Reliance Industries', type: 'CARO Report', content: '', status: 'Under Review', engagementId: 'eng-1', engagement: { title: 'Statutory Audit FY 2024-25', client: { name: 'Reliance Industries Ltd' } }, createdAt: '2025-06-08T00:00:00Z' },
    { id: 'rpt-3', title: 'Tax Audit Report Form 3CA/3CD - TCS', type: 'Tax Audit Report', content: '', status: 'Draft', engagementId: 'eng-2', engagement: { title: 'Tax Audit u/s 44AB', client: { name: 'Tata Consultancy Services' } }, createdAt: '2025-06-05T00:00:00Z' },
    { id: 'rpt-4', title: 'Internal Audit Report Q1 - HDFC Bank', type: 'Internal Audit Report', content: '', status: 'Final', engagementId: 'eng-4', engagement: { title: 'Internal Audit Q1 2025-26', client: { name: 'HDFC Bank Ltd' } }, createdAt: '2025-06-14T00:00:00Z' },
  ],

  observations: [
    { id: 'obs-1', title: 'Inventory Valuation Discrepancy', criteria: 'Ind AS 2 - Inventories', condition: 'Inventory valued at cost exceeding NRV for 12 items totalling ₹2.3 Cr', cause: 'NRV assessment not performed quarterly', effect: 'Potential overstatement of inventory by ₹45 lakhs', recommendation: 'Implement quarterly NRV assessment and write-down procedures', managementResponse: 'Will implement from Q2 2025-26', severity: 'Moderate', status: 'Open', saReference: 'SA 501', createdAt: '2025-06-12T00:00:00Z' },
    { id: 'obs-2', title: 'Related Party Disclosure Gap', criteria: 'Ind AS 24 - Related Party Disclosures', condition: 'Three related party transactions aggregating ₹15 Cr not disclosed in notes', cause: 'Incomplete related party identification process', effect: 'Non-compliance with disclosure requirements under Ind AS 24', recommendation: 'Strengthen related party identification and disclosure process', severity: 'Critical', status: 'Open', saReference: 'SA 550', createdAt: '2025-06-10T00:00:00Z' },
    { id: 'obs-3', title: 'Weak IT General Controls', criteria: 'SA 315 - IT Environment Assessment', condition: 'Password policy allows 6-character passwords without complexity requirements', cause: 'IT policy not updated since 2022', effect: 'Increased risk of unauthorized access to financial systems', recommendation: 'Update IT policy to require minimum 12-character complex passwords with MFA', severity: 'Moderate', status: 'Resolved', saReference: 'SA 315', createdAt: '2025-05-28T00:00:00Z' },
  ],

  form3cd: [
    { clauseNumber: '1', title: 'Name of the assessee', response: 'Tata Consultancy Services Ltd', isApplicable: true },
    { clauseNumber: '2', title: 'Address', response: 'TCS House, Raveline Street, Fort, Mumbai - 400001', isApplicable: true },
    { clauseNumber: '3', title: 'Permanent Account Number', response: 'AABCT5678B', isApplicable: true },
    { clauseNumber: '7(a)', title: 'Whether books of account are maintained', response: 'Yes, books maintained on accrual basis using SAP S/4HANA', isApplicable: true },
    { clauseNumber: '9(a)', title: 'Amounts debited to profit and loss - Capital nature', response: 'Capital expenditure of ₹125 Cr debited to P&L identified and adjusted', isApplicable: true },
    { clauseNumber: '14(a)', title: 'Details of depreciation', response: 'Depreciation computed as per Income Tax Act, 1961 at rates specified in Appendix I', isApplicable: true },
    { clauseNumber: '21', title: 'CARO 2020 Reporting', response: '', isApplicable: true },
    { clauseNumber: '26', title: 'TDS/TCS compliance', response: 'All TDS/TCS obligations complied with. Form 26AS reconciled.', isApplicable: true },
    { clauseNumber: '30A', title: 'GST compliance', response: '', isApplicable: false },
    { clauseNumber: '44', title: 'Break-up of total expenditure', response: 'Total expenditure: ₹1,85,432 Cr. Entity-wise and nature-wise break-up maintained.', isApplicable: true },
  ],

  // ─── Admin: Users ───
  users: [
    { id: 'u1', email: 'rajesh.sharma@auditiq.in', firstName: 'Rajesh', lastName: 'Sharma', initials: 'RS', role: 'Partner', designation: 'Senior Partner', phone: '+91 98765 43210', firmId: 'f1', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'u2', email: 'priya.patel@auditiq.in', firstName: 'Priya', lastName: 'Patel', initials: 'PP', role: 'Manager', designation: 'Audit Manager', phone: '+91 98765 43211', firmId: 'f1', isActive: true, createdAt: '2024-02-15T00:00:00Z' },
    { id: 'u3', email: 'amit.kumar@auditiq.in', firstName: 'Amit', lastName: 'Kumar', initials: 'AK', role: 'Staff', designation: 'Senior Auditor', phone: '+91 98765 43212', firmId: 'f1', isActive: true, createdAt: '2024-03-10T00:00:00Z' },
    { id: 'u4', email: 'neha.gupta@auditiq.in', firstName: 'Neha', lastName: 'Gupta', initials: 'NG', role: 'Partner', designation: 'Managing Partner', phone: '+91 98765 43213', firmId: 'f1', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'u5', email: 'sanjay.mehta@auditiq.in', firstName: 'Sanjay', lastName: 'Mehta', initials: 'SM', role: 'Manager', designation: 'Tax Manager', phone: '+91 98765 43214', firmId: 'f1', isActive: true, createdAt: '2024-04-01T00:00:00Z' },
    { id: 'u6', email: 'deepa.nair@auditiq.in', firstName: 'Deepa', lastName: 'Nair', initials: 'DN', role: 'Staff', designation: 'Audit Associate', phone: '+91 98765 43215', firmId: 'f1', isActive: true, createdAt: '2024-06-01T00:00:00Z' },
    { id: 'u7', email: 'vikram.singh@auditiq.in', firstName: 'Vikram', lastName: 'Singh', initials: 'VS', role: 'Staff', designation: 'Article Trainee', phone: '+91 98765 43216', firmId: 'f1', isActive: false, createdAt: '2024-08-01T00:00:00Z' },
  ],

  // ─── Admin: Roles ───
  roles: [
    { id: 'role-1', name: 'Partner', description: 'Full access to all modules and admin functions', isSystem: true, isActive: true, userCount: 2, permissions: [
      { id: 'p1', module: 'dashboard', action: 'view' }, { id: 'p2', module: 'engagements', action: 'view' }, { id: 'p3', module: 'engagements', action: 'create' }, { id: 'p4', module: 'engagements', action: 'edit' }, { id: 'p5', module: 'engagements', action: 'delete' }, { id: 'p6', module: 'engagements', action: 'approve' },
      { id: 'p7', module: 'workpapers', action: 'view' }, { id: 'p8', module: 'workpapers', action: 'create' }, { id: 'p9', module: 'workpapers', action: 'edit' }, { id: 'p10', module: 'workpapers', action: 'approve' },
      { id: 'p11', module: 'documents', action: 'view' }, { id: 'p12', module: 'documents', action: 'create' }, { id: 'p13', module: 'documents', action: 'delete' }, { id: 'p14', module: 'documents', action: 'export' },
      { id: 'p15', module: 'reports', action: 'view' }, { id: 'p16', module: 'reports', action: 'create' }, { id: 'p17', module: 'reports', action: 'approve' }, { id: 'p18', module: 'reports', action: 'export' },
      { id: 'p19', module: 'attendance', action: 'view' }, { id: 'p20', module: 'copilot', action: 'view' }, { id: 'p21', module: 'settings', action: 'view' }, { id: 'p22', module: 'settings', action: 'edit' },
      { id: 'p23', module: 'clients', action: 'view' }, { id: 'p24', module: 'clients', action: 'create' }, { id: 'p25', module: 'clients', action: 'edit' }, { id: 'p26', module: 'clients', action: 'delete' },
    ] },
    { id: 'role-2', name: 'Manager', description: 'Can manage engagements, workpapers, and team. Cannot access admin settings.', isSystem: true, isActive: true, userCount: 2, permissions: [
      { id: 'p30', module: 'dashboard', action: 'view' }, { id: 'p31', module: 'engagements', action: 'view' }, { id: 'p32', module: 'engagements', action: 'create' }, { id: 'p33', module: 'engagements', action: 'edit' },
      { id: 'p34', module: 'workpapers', action: 'view' }, { id: 'p35', module: 'workpapers', action: 'create' }, { id: 'p36', module: 'workpapers', action: 'edit' }, { id: 'p37', module: 'workpapers', action: 'approve' },
      { id: 'p38', module: 'documents', action: 'view' }, { id: 'p39', module: 'documents', action: 'create' }, { id: 'p40', module: 'documents', action: 'export' },
      { id: 'p41', module: 'reports', action: 'view' }, { id: 'p42', module: 'reports', action: 'create' },
      { id: 'p43', module: 'attendance', action: 'view' }, { id: 'p44', module: 'copilot', action: 'view' },
      { id: 'p45', module: 'clients', action: 'view' }, { id: 'p46', module: 'clients', action: 'create' },
    ] },
    { id: 'role-3', name: 'Staff', description: 'Can view and create workpapers, upload documents. Limited access.', isSystem: true, isActive: true, userCount: 3, permissions: [
      { id: 'p50', module: 'dashboard', action: 'view' }, { id: 'p51', module: 'engagements', action: 'view' },
      { id: 'p52', module: 'workpapers', action: 'view' }, { id: 'p53', module: 'workpapers', action: 'create' }, { id: 'p54', module: 'workpapers', action: 'edit' },
      { id: 'p55', module: 'documents', action: 'view' }, { id: 'p56', module: 'documents', action: 'create' },
      { id: 'p57', module: 'reports', action: 'view' },
      { id: 'p58', module: 'attendance', action: 'view' }, { id: 'p59', module: 'copilot', action: 'view' },
    ] },
    { id: 'role-4', name: 'Client', description: 'Read-only access to their own documents and engagement status.', isSystem: true, isActive: true, userCount: 0, permissions: [
      { id: 'p60', module: 'dashboard', action: 'view' }, { id: 'p61', module: 'documents', action: 'view' },
      { id: 'p62', module: 'reports', action: 'view' },
    ] },
  ],

  // ─── Admin: Firm ───
  firm: {
    id: 'f1',
    name: 'Sharma Gupta & Associates',
    registrationNo: 'FRN-012345S',
    pan: 'AAHFS1234A',
    gstin: '27AAHFS1234A1ZV',
    address: '301, Commerce House, Nariman Point',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400021',
    phone: '+91 22 2281 5500',
    email: 'info@sgassociates.in',
    website: 'www.sgassociates.in',
  },

  // ─── Admin: Audit Log ───
  auditLog: [
    { id: 'log-1', action: 'User Login', user: 'Rajesh Sharma', details: 'Logged in from 103.152.x.x', timestamp: '2025-06-15T14:30:00Z' },
    { id: 'log-2', action: 'Document Upload', user: 'Priya Patel', details: 'Uploaded Balance Sheet - RIL FY25.pdf', timestamp: '2025-06-15T12:15:00Z' },
    { id: 'log-3', action: 'Workpaper Approved', user: 'Neha Gupta', details: 'Approved WP-RIL-001 Revenue Recognition Testing', timestamp: '2025-06-14T18:20:00Z' },
    { id: 'log-4', action: 'Role Updated', user: 'Rajesh Sharma', details: 'Updated Staff role permissions - added export', timestamp: '2025-06-14T16:00:00Z' },
    { id: 'log-5', action: 'Engagement Created', user: 'Sanjay Mehta', details: 'Created Tax Audit - TCS FY 2024-25', timestamp: '2025-06-14T11:30:00Z' },
    { id: 'log-6', action: 'User Deactivated', user: 'Rajesh Sharma', details: 'Deactivated user Vikram Singh (Article training ended)', timestamp: '2025-06-10T10:00:00Z' },
  ],
};

export default api;
