/** Client mirror of server workflow catalog (DT / IDT / AUDIT — MKD firm). */

export type WorkflowDomain = 'DT' | 'IDT' | 'AUDIT';

export const WORKFLOW_DOMAIN_LABELS: Record<WorkflowDomain, string> = {
  DT: 'Direct Tax (DT)',
  IDT: 'Indirect Tax (IDT)',
  AUDIT: 'Audit & Assurance',
};

export const SERVICE_CATALOG = [
  { code: 'TDS_REMITTANCE', domain: 'DT' as WorkflowDomain, name: 'TDS remittance', dueRule: '7th of every month' },
  { code: 'TDS_QUARTERLY', domain: 'DT', name: 'TDS quarterly return', dueRule: 'End of month after quarter' },
  { code: 'TCS_QUARTERLY', domain: 'DT', name: 'TCS quarterly return', dueRule: '15th after quarter' },
  { code: 'ADVANCE_TAX', domain: 'DT', name: 'Advance tax', dueRule: 'Quarter end month' },
  { code: 'FORM_145_146', domain: 'DT', name: 'Form 16A / 16B / 145', dueRule: 'On need basis' },
  { code: 'SFT', domain: 'DT', name: 'SFT (Form 61A)', dueRule: '31 May' },
  { code: 'FORM_10BD', domain: 'DT', name: 'Form 10BD', dueRule: '31 May' },
  { code: 'ITR_JULY', domain: 'DT', name: 'Income tax return (July)', dueRule: '31 July' },
  { code: 'ITR_AUGUST', domain: 'DT', name: 'Income tax return (August)', dueRule: '31 August' },
  { code: 'TAX_AUDIT_REPORT', domain: 'DT', name: 'Tax audit report (Sec. 44AB)', dueRule: '30 September' },
  { code: 'ITR_NON_TP', domain: 'DT', name: 'ITR (non-TP)', dueRule: '31 October' },
  { code: 'TP_BUNDLE', domain: 'DT', name: 'TP — ITR, 3CEB & 3CEAA', dueRule: '30 November' },
  { code: 'TP_STUDY', domain: 'DT', name: 'TP study report', dueRule: '31 December' },
  { code: 'NOTICES', domain: 'DT', name: 'Notices & assessments', dueRule: 'Ongoing' },
  { code: 'DEPT_FOLLOWUP', domain: 'DT', name: 'Departmental follow-up', dueRule: 'Ongoing' },
  { code: 'GST_MONTHLY_RETURNS', domain: 'IDT', name: 'GST Monthly Returns', dueRule: 'Data by 1st of month' },
  { code: 'GSTR_1', domain: 'IDT', name: 'GSTR-1', dueRule: 'Data by 1st of month' },
  { code: 'GSTR_3B', domain: 'IDT', name: 'GSTR-3B', dueRule: 'Data by 14th of month' },
  { code: 'GST_NOTICES', domain: 'IDT', name: 'GST notices & others', dueRule: 'As required' },
  { code: 'STATUTORY_AUDIT', domain: 'AUDIT', name: 'Statutory audit', dueRule: 'Per engagement letter' },
  { code: 'TAX_AUDIT_44AB', domain: 'AUDIT', name: 'Tax audit u/s 44AB', dueRule: '30 September' },
];
