import type { WorkflowDomain } from '@/lib/workflowCatalog';

/** Statutory audit — client-visible progress buckets */
const AUDIT_CLIENT_PROGRESS = [
  { label: 'Data', stages: ['Data Pending', 'Data Received'] },
  { label: 'Execution', stages: ['Execution (WIP)', 'Draft Ready'] },
  { label: 'Review', stages: ['Review with Manager', 'Partner Review', 'Audit manager review', 'Partner review'] },
  { label: 'Sign-off', stages: ['Client Discussion', 'UDIN Generated', 'Client review'] },
  { label: 'Filed', stages: ['Filed', 'Archived'] },
] as const;

/** DT / IDT compliance — client-visible progress buckets */
const COMPLIANCE_CLIENT_PROGRESS = [
  { label: 'Data & preparation', stages: ['Engagement request', 'Data request', 'Article executive task'] },
  { label: 'Review', stages: ['Audit manager review', 'Client review', 'Partner review'] },
  { label: 'Filing', stages: ['Filing', 'Documentation'] },
  { label: 'Billing', stages: ['Billing'] },
] as const;

export const CLIENT_PROGRESS_STEPS = AUDIT_CLIENT_PROGRESS;

export const CLIENT_STAGE_DESCRIPTIONS: Record<string, string> = {
  'Data Pending': "We're waiting for your documents. Please upload the required files.",
  'Data Received': 'Your documents have been received. The team will begin work shortly.',
  'Execution (WIP)': 'The team is working on your engagement. No action needed from you.',
  'Draft Ready': 'A draft has been prepared. It will be reviewed by the Audit Manager.',
  'Review with Manager': 'Your engagement is under Audit Manager review.',
  'Partner Review': 'The Partner is reviewing your engagement.',
  'Client Discussion': 'The team may reach out to discuss findings with you.',
  'UDIN Generated': 'Your report has been signed and is ready for filing.',
  Filed: 'Your engagement has been filed successfully.',
  Archived: 'This engagement is complete and archived.',
  'Engagement request': 'Your service request has been received by the firm.',
  'Data request': 'Please upload the documents requested for this compliance cycle.',
  'Article executive task': 'Our article executive is preparing your return or compliance work.',
  'Audit manager review': 'Your file is under Audit Manager review before sign-off.',
  'Client review': 'Please review and confirm the draft before filing.',
  'Partner review': 'The Partner is performing final review and sign-off.',
  Filing: 'Your return or compliance has been filed with the department.',
  Documentation: 'Filing records are being archived in your engagement file.',
  Billing: 'Invoice has been raised for this engagement.',
};

function progressStepsForDomain(domain?: WorkflowDomain | string | null) {
  if (domain === 'DT' || domain === 'IDT') return COMPLIANCE_CLIENT_PROGRESS;
  return AUDIT_CLIENT_PROGRESS;
}

export function getClientProgressStepIndex(
  currentStage: string,
  domain?: WorkflowDomain | string | null
): number {
  const steps = progressStepsForDomain(domain);
  const stageSets = steps.map((step) => new Set(step.stages as readonly string[]));
  for (let i = 0; i < stageSets.length; i++) {
    if (stageSets[i].has(currentStage)) return i;
  }
  return 0;
}

export function getClientProgressStepLabels(domain?: WorkflowDomain | string | null): string[] {
  return progressStepsForDomain(domain).map((s) => s.label);
}
