import prisma from './prisma.js';
import {
  type TemplateId,
  type WorkflowDomain,
  type OwnerTier,
  WORKFLOW_TEMPLATES,
  resolveTemplateId,
  resolveWorkflowDomain,
  stageToCode,
  getStepsForTemplate,
  getStepCodesForTemplate,
  getStepsForService,
  codeToDisplayStage,
  CODE_TO_LEGACY_STAGE,
} from './workflowCatalog.js';

const TIER_TO_ROLES: Record<OwnerTier, string[]> = {
  client: ['Client'],
  article: ['Staff', 'Intern', 'Manager', 'Partner', 'Admin'],
  senior_exec: ['Staff', 'Manager', 'Partner', 'Admin'],
  manager: ['Manager', 'Partner', 'Admin'],
  partner: ['Partner', 'Admin'],
  accounts: ['Manager', 'Partner', 'Admin', 'Staff', 'Accounts'],
  any: ['Staff', 'Intern', 'Manager', 'Partner', 'Admin'],
};

export function normalizeEngagementStage(
  currentStage: string,
  templateId: TemplateId
): string {
  return parseStoredStageToCode(currentStage, templateId);
}

export function getEngagementWorkflowMeta(eng: {
  currentStage: string;
  workflowDomain?: string | null;
  serviceCode?: string | null;
  type?: string | null;
}) {
  const templateId = resolveTemplateId(eng);
  const domain = resolveWorkflowDomain(eng);
  const steps = getStepsForService(eng.serviceCode, templateId);
  const stepCodes = steps.map((s) => s.code);
  const currentCode = normalizeEngagementStage(eng.currentStage, templateId);
  const currentIndex = Math.max(0, stepCodes.indexOf(currentCode));
  return {
    templateId,
    domain,
    steps,
    stepCodes,
    currentCode,
    currentIndex,
    currentLabel: steps[currentIndex]?.label ?? eng.currentStage,
  };
}

export function canRoleMoveToStep(role: string, stepCode: string, templateId: TemplateId): boolean {
  const step = WORKFLOW_TEMPLATES[templateId].steps.find((s) => s.code === stepCode);
  if (!step) return false;
  return TIER_TO_ROLES[step.ownerTier].includes(role);
}

/**
 * Grade-aware gate: Senior executive check requires Senior Audit Executive (or Manager+).
 * Plain Audit Executives cannot advance to SR_EXEC_REVIEW / MANAGER_REVIEW.
 */
export function canUserMoveToStep(
  role: string,
  hierarchyCode: string | null | undefined,
  stepCode: string,
  templateId: TemplateId
): boolean {
  if (!canRoleMoveToStep(role, stepCode, templateId)) return false;
  const step = WORKFLOW_TEMPLATES[templateId].steps.find((s) => s.code === stepCode);
  if (!step) return false;
  if (step.ownerTier === 'senior_exec') {
    if (['Partner', 'Admin', 'Manager'].includes(role)) return true;
    return hierarchyCode === 'SENIOR_AUDIT_EXECUTIVE';
  }
  return true;
}

export function stageCodeForStorage(code: string, templateId: TemplateId): string {
  if (templateId === 'AUDIT_STATUTORY' && CODE_TO_LEGACY_STAGE[code]) {
    return CODE_TO_LEGACY_STAGE[code];
  }
  const step = WORKFLOW_TEMPLATES[templateId].steps.find((s) => s.code === code);
  return step?.label ?? code;
}

export function parseStoredStageToCode(stored: string, templateId: TemplateId): string {
  const fromLegacy = stageToCode(stored);
  const steps = getStepCodesForTemplate(templateId);
  if (steps.includes(fromLegacy)) return fromLegacy;
  const byLabel = WORKFLOW_TEMPLATES[templateId].steps.find(
    (s) => s.label.toLowerCase() === stored.toLowerCase()
  );
  if (byLabel) return byLabel.code;
  return steps[0] ?? 'DATA_PENDING';
}

export async function checkWorkflowGating(
  engagementId: string,
  eng: { udin: string | null; partnerInChargeId: string | null },
  toCode: string,
  templateId: TemplateId
): Promise<{ allowed: boolean; blockers: string[] }> {
  const blockers: string[] = [];

  if (toCode === 'MANAGER_REVIEW' || toCode === 'DATA_RECEIVED') {
    const missingItems = await prisma.dataChecklistItem.count({
      where: { engagementId, status: 'Missing' },
    });
    if (missingItems > 0) {
      blockers.push(
        `${missingItems} checklist item(s) still marked "Missing". Complete data collection before manager review.`
      );
    }
  }

  if (toCode === 'DATA_REQUEST' || toCode === 'DATA_PENDING') {
    /* always allowed backward or initial */
  }

  if (templateId === 'AUDIT_STATUTORY') {
    if (toCode === 'UDIN_GENERATED' && !eng.udin) {
      blockers.push('UDIN must be recorded before sign-off.');
    }
    if (toCode === 'FILED') {
      if (!eng.udin) blockers.push('UDIN is mandatory before filing.');
      const partnerSignoff = await prisma.signOff.findFirst({
        where: { engagementId, type: 'Partner', status: 'Approved' },
      });
      if (!partnerSignoff) blockers.push('Partner sign-off is required before filing.');
    }
  }

  if (toCode === 'FILING' && templateId !== 'AUDIT_STATUTORY') {
    const checklistOpen = await prisma.dataChecklistItem.count({
      where: { engagementId, status: { in: ['Missing', 'Requested'] } },
    });
    if (checklistOpen > 0) {
      blockers.push('Outstanding data requests must be cleared before filing.');
    }
  }

  if (toCode === 'DOCUMENTATION') {
    const docCount = await prisma.document.count({ where: { engagementId } });
    if (docCount === 0) {
      blockers.push('Upload at least one engagement document before moving to Documentation.');
    }
  }

  return { allowed: blockers.length === 0, blockers };
}

export function clientStageLabelForCode(code: string, templateId: TemplateId): string {
  const step = WORKFLOW_TEMPLATES[templateId].steps.find((s) => s.code === code);
  return step?.clientLabel ?? step?.label ?? code;
}

const CLIENT_STAGE_DESCRIPTIONS: Record<string, string> = {
  DATA_REQUEST: "We're waiting for your documents. Please upload the required files.",
  DATA_PENDING: "We're waiting for your documents. Please upload the required files.",
  ARTICLE_TASK: 'Our team is preparing your compliance work.',
  EXECUTION_WIP: 'The team is working on your engagement.',
  MANAGER_REVIEW: 'Your engagement is under manager review.',
  PARTNER_REVIEW: 'The Partner is reviewing your engagement.',
  CLIENT_REVIEW: 'We may need your confirmation before filing.',
  CLIENT_DISCUSSION: 'The team may reach out to discuss findings with you.',
  FILING: 'Filing with the tax department is in progress or complete.',
  FILED: 'Your engagement has been filed successfully.',
  DOCUMENTATION: 'Final records are being archived.',
  BILLING: 'Your invoice will be raised upon completion.',
  DRAFT_READY: 'A draft has been prepared and is being reviewed internally.',
  DATA_RECEIVED: 'Your documents have been received. Work will begin shortly.',
  UDIN_GENERATED: 'Your report has been signed and is ready for filing.',
  ARCHIVED: 'This engagement is complete.',
};

export function clientStageDescriptionForCode(code: string, templateId: TemplateId): string {
  if (CLIENT_STAGE_DESCRIPTIONS[code]) return CLIENT_STAGE_DESCRIPTIONS[code];
  return clientStageLabelForCode(code, templateId);
}

export function buildClientPortalTimeline(
  eng: {
    currentStage: string;
    workflowDomain?: string | null;
    serviceCode?: string | null;
    type?: string | null;
  },
  stageHistory: Array<{ toStage: string; createdAt: Date }>
) {
  const meta = getEngagementWorkflowMeta(eng);
  const steps = meta.steps;
  const currentIdx = meta.currentIndex;

  const stages = steps.map((step, idx) => {
    const historyForStage = stageHistory.filter(
      (h) => parseStoredStageToCode(h.toStage, meta.templateId) === step.code
    );
    const last = historyForStage[historyForStage.length - 1];
    let status: 'completed' | 'active' | 'pending' = 'pending';
    if (idx < currentIdx) status = 'completed';
    else if (idx === currentIdx) status = 'active';

    return {
      id: step.code,
      stage: clientStageLabelForCode(step.code, meta.templateId),
      status,
      timestamp: last?.createdAt.toISOString() ?? null,
      description: clientStageDescriptionForCode(step.code, meta.templateId),
    };
  });

  return {
    templateId: meta.templateId,
    currentStageLabel: clientStageLabelForCode(meta.currentCode, meta.templateId),
    stages,
  };
}

export function clientProgressBuckets(templateId: TemplateId): { label: string; codes: string[] }[] {
  if (templateId === 'IDT_GST_RETURN' || templateId === 'DT_COMPLIANCE') {
    return [
      { label: 'Data & preparation', codes: ['CLIENT_REQUEST', 'DATA_REQUEST', 'ARTICLE_TASK'] },
      { label: 'Review', codes: ['MANAGER_REVIEW', 'CLIENT_REVIEW', 'PARTNER_REVIEW'] },
      { label: 'Filing', codes: ['FILING', 'DOCUMENTATION'] },
      { label: 'Billing', codes: ['BILLING'] },
    ];
  }
  return [
    { label: 'Data', codes: ['DATA_PENDING', 'DATA_RECEIVED'] },
    { label: 'Execution', codes: ['EXECUTION_WIP', 'DRAFT_READY'] },
    { label: 'Review', codes: ['MANAGER_REVIEW', 'PARTNER_REVIEW'] },
    { label: 'Sign-off', codes: ['CLIENT_DISCUSSION', 'UDIN_GENERATED'] },
    { label: 'Filed', codes: ['FILED', 'ARCHIVED'] },
  ];
}

export function inferDomainFromEngagementType(type: string): WorkflowDomain {
  if (type === 'GST') return 'IDT';
  if (['Tax (44AB)', 'Statutory', 'Internal'].includes(type)) return 'AUDIT';
  if (type.includes('Tax') || type.includes('TDS')) return 'DT';
  return 'AUDIT';
}
