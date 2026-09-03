import {
  codeToDisplayStage,
  getStepsForService,
  resolveTemplateId,
  stageToCode,
  type TemplateId,
} from './workflowCatalog.js';

/** Title heuristics → canonical workflow step code (MKD pipeline). */
const TITLE_STAGE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/partner|sign.?off/i, 'PARTNER_REVIEW'],
  [/manager review|audit manager|under manager/i, 'MANAGER_REVIEW'],
  [/client|confirm|approval|acknowledg/i, 'CLIENT_REVIEW'],
  [/data request|checklist|documents requested|gather data|verify opening/i, 'DATA_REQUEST'],
  [
    /reconcil|prepare|compile|draft|vouch|test|walkthrough|execute|fieldwork|substantive|clause/i,
    'ARTICLE_TASK',
  ],
  [/\b(file|filing|upload|submit|udin|arn|e-fil)\b/i, 'FILING'],
  [/archive|documentation|record/i, 'DOCUMENTATION'],
  [/bill|invoice|wip/i, 'BILLING'],
  [/draft ready|draft report/i, 'DRAFT_READY'],
  [/udin|signed report|issue final/i, 'UDIN_GENERATED'],
  [/execution|wip|fieldwork/i, 'EXECUTION_WIP'],
];

export type EngagementPipelineContext = {
  currentStage?: string | null;
  serviceCode?: string | null;
  workflowDomain?: string | null;
  type?: string | null;
};

export function inferPipelineStageFromTitle(title: string): string | null {
  for (const [re, code] of TITLE_STAGE_PATTERNS) {
    if (re.test(title)) return code;
  }
  return null;
}

export function resolveTaskPipelineStage(input: {
  title: string;
  explicitStage?: string | null;
  engagement?: EngagementPipelineContext | null;
}): string {
  if (input.explicitStage) return stageToCode(input.explicitStage);

  const fromTitle = inferPipelineStageFromTitle(input.title);
  if (fromTitle) return fromTitle;

  const eng = input.engagement;
  if (eng?.currentStage) return stageToCode(eng.currentStage);

  const templateId = resolveTemplateId(eng ?? {});
  const steps = getStepsForService(eng?.serviceCode, templateId);
  const article =
    steps.find((s) => s.code === 'ARTICLE_TASK' || s.code === 'EXECUTION_WIP') ?? steps[0];
  return article?.code ?? 'ARTICLE_TASK';
}

export function pipelineStageLabel(
  stage: string | null | undefined,
  eng: EngagementPipelineContext
): string | null {
  if (!stage) return null;
  const templateId = resolveTemplateId(eng);
  return codeToDisplayStage(stageToCode(stage), templateId);
}

export function isValidPipelineStageForEngagement(stage: string, eng: EngagementPipelineContext): boolean {
  const templateId = resolveTemplateId(eng);
  const steps = getStepsForService(eng.serviceCode, templateId);
  const code = stageToCode(stage);
  return steps.some((s) => s.code === code);
}

export function pipelineStepsForEngagement(eng: EngagementPipelineContext): Array<{ code: string; label: string }> {
  const templateId = resolveTemplateId(eng);
  return getStepsForService(eng.serviceCode, templateId).map((s) => ({
    code: s.code,
    label: s.label,
  }));
}

export function templateIdForEngagement(eng: EngagementPipelineContext): TemplateId {
  return resolveTemplateId(eng);
}
