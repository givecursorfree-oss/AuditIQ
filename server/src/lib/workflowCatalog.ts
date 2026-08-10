/**
 * MKD CA firm workflow catalog — sourced from DT / IDT / Hierarchy workbook.
 * Internal stage codes are stable; labels are client- and staff-facing.
 */

export type WorkflowDomain = 'DT' | 'IDT' | 'AUDIT';

export type OwnerTier =
  | 'client'
  | 'article'
  | 'manager'
  | 'partner'
  | 'accounts'
  | 'any';

export type WorkflowStepDef = {
  code: string;
  label: string;
  ownerTier: OwnerTier;
  clientLabel?: string;
  description?: string;
};

export type ServiceCatalogItem = {
  code: string;
  domain: WorkflowDomain;
  name: string;
  dueRule?: string;
  recurrence?: 'monthly' | 'quarterly' | 'annual' | 'ad_hoc';
  templateId: string;
};

export const WORKFLOW_TEMPLATES = {
  IDT_GST_RETURN: {
    id: 'IDT_GST_RETURN',
    domain: 'IDT' as WorkflowDomain,
    name: 'GST return cycle',
    steps: [
      { code: 'CLIENT_REQUEST', label: 'Engagement request', ownerTier: 'client', clientLabel: 'Service request received' },
      { code: 'DATA_REQUEST', label: 'Data request', ownerTier: 'manager', clientLabel: 'Documents requested' },
      { code: 'ARTICLE_TASK', label: 'Article executive task', ownerTier: 'article', clientLabel: 'Work in progress' },
      { code: 'MANAGER_REVIEW', label: 'Audit manager review', ownerTier: 'manager', clientLabel: 'Under manager review' },
      { code: 'CLIENT_REVIEW', label: 'Client review', ownerTier: 'client', clientLabel: 'Awaiting your confirmation' },
      { code: 'PARTNER_REVIEW', label: 'Partner review', ownerTier: 'partner', clientLabel: 'Partner sign-off' },
      { code: 'FILING', label: 'Filing', ownerTier: 'article', clientLabel: 'Filed with department' },
      { code: 'DOCUMENTATION', label: 'Documentation', ownerTier: 'article', clientLabel: 'Records archived' },
      { code: 'BILLING', label: 'Billing', ownerTier: 'accounts', clientLabel: 'Invoice raised' },
    ] satisfies WorkflowStepDef[],
  },
  DT_COMPLIANCE: {
    id: 'DT_COMPLIANCE',
    domain: 'DT' as WorkflowDomain,
    name: 'Direct tax compliance cycle',
    steps: [
      { code: 'DATA_REQUEST', label: 'Data request', ownerTier: 'manager', clientLabel: 'Documents requested' },
      { code: 'ARTICLE_TASK', label: 'Article executive task', ownerTier: 'article', clientLabel: 'Work in progress' },
      { code: 'MANAGER_REVIEW', label: 'Audit manager review', ownerTier: 'manager', clientLabel: 'Under manager review' },
      { code: 'PARTNER_REVIEW', label: 'Partner review', ownerTier: 'partner', clientLabel: 'Partner sign-off' },
      { code: 'CLIENT_REVIEW', label: 'Client review', ownerTier: 'client', clientLabel: 'Awaiting your confirmation' },
      { code: 'FILING', label: 'Filing', ownerTier: 'article', clientLabel: 'Filed with department' },
      { code: 'DOCUMENTATION', label: 'Documentation', ownerTier: 'article', clientLabel: 'Records archived' },
      { code: 'BILLING', label: 'Billing', ownerTier: 'accounts', clientLabel: 'Invoice raised' },
    ] satisfies WorkflowStepDef[],
  },
  AUDIT_STATUTORY: {
    id: 'AUDIT_STATUTORY',
    domain: 'AUDIT' as WorkflowDomain,
    name: 'Statutory audit & assurance',
    steps: [
      { code: 'DATA_PENDING', label: 'Data pending', ownerTier: 'manager', clientLabel: 'Waiting for your documents' },
      { code: 'DATA_RECEIVED', label: 'Data received', ownerTier: 'manager', clientLabel: 'Documents received' },
      { code: 'EXECUTION_WIP', label: 'Execution (WIP)', ownerTier: 'article', clientLabel: 'Fieldwork in progress' },
      { code: 'DRAFT_READY', label: 'Draft ready', ownerTier: 'article', clientLabel: 'Draft prepared' },
      { code: 'MANAGER_REVIEW', label: 'Audit manager review', ownerTier: 'manager', clientLabel: 'Manager review' },
      { code: 'PARTNER_REVIEW', label: 'Partner review', ownerTier: 'partner', clientLabel: 'Partner review' },
      { code: 'CLIENT_DISCUSSION', label: 'Client discussion', ownerTier: 'client', clientLabel: 'Discussion with client' },
      { code: 'UDIN_GENERATED', label: 'UDIN generated', ownerTier: 'partner', clientLabel: 'Report signed' },
      { code: 'FILED', label: 'Filed', ownerTier: 'partner', clientLabel: 'Filed' },
      { code: 'ARCHIVED', label: 'Archived', ownerTier: 'partner', clientLabel: 'Completed' },
    ] satisfies WorkflowStepDef[],
  },
} as const;

export type TemplateId = keyof typeof WORKFLOW_TEMPLATES;

/** Legacy AuditIQ stage strings → canonical step codes */
export const LEGACY_STAGE_TO_CODE: Record<string, string> = {
  'Data Pending': 'DATA_PENDING',
  'Data Received': 'DATA_RECEIVED',
  'Execution (WIP)': 'EXECUTION_WIP',
  'Draft Ready': 'DRAFT_READY',
  'Review with Manager': 'MANAGER_REVIEW',
  'Partner Review': 'PARTNER_REVIEW',
  'Client Discussion': 'CLIENT_DISCUSSION',
  'UDIN Generated': 'UDIN_GENERATED',
  Filed: 'FILED',
  Archived: 'ARCHIVED',
  'Data Request': 'DATA_REQUEST',
  'Article Executive Task': 'ARTICLE_TASK',
  'Article executive task': 'ARTICLE_TASK',
  'Audit Manager Review': 'MANAGER_REVIEW',
  'Audit manager review': 'MANAGER_REVIEW',
  'Client Review': 'CLIENT_REVIEW',
  'Client review': 'CLIENT_REVIEW',
  Documentation: 'DOCUMENTATION',
  Billing: 'BILLING',
  'Engagement request': 'CLIENT_REQUEST',
};

export const CODE_TO_LEGACY_STAGE: Record<string, string> = {
  DATA_PENDING: 'Data Pending',
  DATA_RECEIVED: 'Data Received',
  EXECUTION_WIP: 'Execution (WIP)',
  DRAFT_READY: 'Draft Ready',
  MANAGER_REVIEW: 'Review with Manager',
  PARTNER_REVIEW: 'Partner Review',
  CLIENT_DISCUSSION: 'Client Discussion',
  UDIN_GENERATED: 'UDIN Generated',
  FILED: 'Filed',
  ARCHIVED: 'Archived',
  DATA_REQUEST: 'Data Request',
  ARTICLE_TASK: 'Article Executive Task',
  CLIENT_REVIEW: 'Client Review',
  CLIENT_REQUEST: 'Engagement Request',
  FILING: 'Filing',
  DOCUMENTATION: 'Documentation',
  BILLING: 'Billing',
};

export const SERVICE_CATALOG: ServiceCatalogItem[] = [
  { code: 'TDS_REMITTANCE', domain: 'DT', name: 'TDS remittance', dueRule: '7th of every month', recurrence: 'monthly', templateId: 'DT_COMPLIANCE' },
  { code: 'TDS_QUARTERLY', domain: 'DT', name: 'TDS quarterly return', dueRule: 'End of month after quarter', recurrence: 'quarterly', templateId: 'DT_COMPLIANCE' },
  { code: 'TCS_QUARTERLY', domain: 'DT', name: 'TCS quarterly return', dueRule: '15th after quarter', recurrence: 'quarterly', templateId: 'DT_COMPLIANCE' },
  { code: 'ADVANCE_TAX', domain: 'DT', name: 'Advance tax', dueRule: 'Quarter end month', recurrence: 'quarterly', templateId: 'DT_COMPLIANCE' },
  { code: 'FORM_145_146', domain: 'DT', name: 'Form 145 / 146', dueRule: 'On need basis', recurrence: 'ad_hoc', templateId: 'DT_COMPLIANCE' },
  { code: 'SFT', domain: 'DT', name: 'Statement of financial transactions (SFT)', dueRule: '31 May', recurrence: 'annual', templateId: 'DT_COMPLIANCE' },
  { code: 'FORM_10BD', domain: 'DT', name: 'Form 10BD', dueRule: '31 May', recurrence: 'annual', templateId: 'DT_COMPLIANCE' },
  { code: 'ITR_JULY', domain: 'DT', name: 'Income tax return (July)', dueRule: '31 July', recurrence: 'annual', templateId: 'DT_COMPLIANCE' },
  { code: 'ITR_AUGUST', domain: 'DT', name: 'Income tax return (August)', dueRule: '31 August', recurrence: 'annual', templateId: 'DT_COMPLIANCE' },
  { code: 'TAX_AUDIT_REPORT', domain: 'DT', name: 'Tax audit report (Sec. 44AB)', dueRule: '30 September', recurrence: 'annual', templateId: 'AUDIT_STATUTORY' },
  { code: 'ITR_NON_TP', domain: 'DT', name: 'ITR (non-transfer pricing)', dueRule: '31 October', recurrence: 'annual', templateId: 'DT_COMPLIANCE' },
  { code: 'TP_BUNDLE', domain: 'DT', name: 'Transfer pricing — ITR, 3CEB & 3CEAA', dueRule: '30 November', recurrence: 'annual', templateId: 'DT_COMPLIANCE' },
  { code: 'TP_STUDY', domain: 'DT', name: 'Transfer pricing study report', dueRule: '31 December', recurrence: 'annual', templateId: 'DT_COMPLIANCE' },
  { code: 'NOTICES', domain: 'DT', name: 'Notices & assessments', dueRule: 'Ongoing', recurrence: 'ad_hoc', templateId: 'DT_COMPLIANCE' },
  { code: 'DEPT_FOLLOWUP', domain: 'DT', name: 'Departmental follow-up', dueRule: 'Ongoing', recurrence: 'ad_hoc', templateId: 'DT_COMPLIANCE' },
  { code: 'GST_MONTHLY_RETURNS', domain: 'IDT', name: 'GST Monthly Returns', dueRule: 'Data by 1st of month', recurrence: 'monthly', templateId: 'IDT_GST_RETURN' },
  { code: 'GSTR_1', domain: 'IDT', name: 'GSTR-1', dueRule: 'Data by 1st of month', recurrence: 'monthly', templateId: 'IDT_GST_RETURN' },
  { code: 'GSTR_3B', domain: 'IDT', name: 'GSTR-3B', dueRule: 'Data by 14th of month', recurrence: 'monthly', templateId: 'IDT_GST_RETURN' },
  { code: 'GST_NOTICES', domain: 'IDT', name: 'GST notices & others', dueRule: 'As required', recurrence: 'ad_hoc', templateId: 'IDT_GST_RETURN' },
  { code: 'STATUTORY_AUDIT', domain: 'AUDIT', name: 'Statutory audit', dueRule: 'Per engagement letter', templateId: 'AUDIT_STATUTORY' },
  { code: 'TAX_AUDIT_44AB', domain: 'AUDIT', name: 'Tax audit u/s 44AB', dueRule: '30 September', templateId: 'AUDIT_STATUTORY' },
];

export const MKD_HIERARCHY = [
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
] as const;

export function resolveTemplateId(eng: {
  workflowDomain?: string | null;
  serviceCode?: string | null;
  type?: string | null;
}): TemplateId {
  if (eng.serviceCode) {
    const svc = SERVICE_CATALOG.find((s) => s.code === eng.serviceCode);
    if (svc) return svc.templateId as TemplateId;
  }
  if (eng.workflowDomain === 'DT') return 'DT_COMPLIANCE';
  if (eng.workflowDomain === 'IDT') return 'IDT_GST_RETURN';
  if (eng.type === 'GST') return 'IDT_GST_RETURN';
  if (eng.type === 'Tax (44AB)' || eng.type === 'Statutory') return 'AUDIT_STATUTORY';
  return 'AUDIT_STATUTORY';
}

export function resolveWorkflowDomain(eng: {
  workflowDomain?: string | null;
  serviceCode?: string | null;
  type?: string | null;
}): WorkflowDomain {
  if (eng.workflowDomain && ['DT', 'IDT', 'AUDIT'].includes(eng.workflowDomain)) {
    return eng.workflowDomain as WorkflowDomain;
  }
  if (eng.serviceCode) {
    const svc = SERVICE_CATALOG.find((s) => s.code === eng.serviceCode);
    if (svc) return svc.domain;
  }
  if (eng.type === 'GST') return 'IDT';
  if (eng.type === 'Tax (44AB)' || eng.type === 'Statutory') return 'AUDIT';
  return 'AUDIT';
}

export function stageToCode(stage: string): string {
  return LEGACY_STAGE_TO_CODE[stage] ?? stage;
}

export function codeToDisplayStage(code: string, templateId: TemplateId): string {
  const template = WORKFLOW_TEMPLATES[templateId];
  const step = template.steps.find((s) => s.code === code);
  if (step) return step.label;
  return CODE_TO_LEGACY_STAGE[code] ?? code;
}

export function getStepsForTemplate(templateId: TemplateId): WorkflowStepDef[] {
  return [...WORKFLOW_TEMPLATES[templateId].steps];
}

export function getStepCodesForTemplate(templateId: TemplateId): string[] {
  return WORKFLOW_TEMPLATES[templateId].steps.map((s) => s.code);
}

/** MKD service-specific pipeline overrides (GSTR-1 skips partner/doc/billing, etc.) */
const SERVICE_STEP_OVERRIDES: Record<string, string[]> = {
  GST_MONTHLY_RETURNS: ['DATA_REQUEST', 'ARTICLE_TASK', 'MANAGER_REVIEW', 'CLIENT_REVIEW', 'FILING', 'DOCUMENTATION', 'BILLING'],
  GSTR_1: ['DATA_REQUEST', 'ARTICLE_TASK', 'MANAGER_REVIEW', 'CLIENT_REVIEW', 'FILING'],
  GSTR_3B: ['DATA_REQUEST', 'ARTICLE_TASK', 'MANAGER_REVIEW', 'CLIENT_REVIEW', 'FILING', 'DOCUMENTATION', 'BILLING'],
  GST_NOTICES: [
    'DATA_REQUEST',
    'ARTICLE_TASK',
    'MANAGER_REVIEW',
    'PARTNER_REVIEW',
    'CLIENT_REVIEW',
    'FILING',
    'DOCUMENTATION',
    'BILLING',
  ],
};

export function getStepsForService(serviceCode?: string | null, templateId?: TemplateId): WorkflowStepDef[] {
  const resolvedTemplate = templateId ?? (serviceCode ? resolveTemplateId({ serviceCode }) : 'DT_COMPLIANCE');
  const allSteps = getStepsForTemplate(resolvedTemplate);
  const override = serviceCode ? SERVICE_STEP_OVERRIDES[serviceCode] : undefined;
  if (!override) {
    if (resolvedTemplate === 'DT_COMPLIANCE') {
      return allSteps.filter((s) => s.code !== 'CLIENT_REQUEST');
    }
    if (resolvedTemplate === 'IDT_GST_RETURN' && !serviceCode) {
      return allSteps.filter((s) => s.code !== 'CLIENT_REQUEST' && s.code !== 'PARTNER_REVIEW');
    }
    return allSteps;
  }
  const byCode = new Map(allSteps.map((s) => [s.code, s]));
  return override.map((code) => byCode.get(code)).filter((s): s is WorkflowStepDef => Boolean(s));
}
