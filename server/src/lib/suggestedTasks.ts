import type { PrismaClient } from '@prisma/client';
import { getChecklistForService, getTasksForService } from './serviceRequirements.js';
import { resolveTaskPipelineStage } from './taskPipeline.js';

interface TaskTemplate {
  title: string;
  description: string;
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  dueDaysBefore: number; // days before engagement deadline
}

const TASK_TEMPLATES: Record<string, TaskTemplate[]> = {
  'Statutory': [
    {
      title: 'Verify opening balances with previous year audit report',
      description: 'Cross-check opening balances against prior year signed financials and audit report.',
      priority: 'High',
      dueDaysBefore: 25,
    },
    {
      title: 'Prepare audit program and planning memorandum',
      description: 'Draft the audit program covering all sections: revenue, expenses, fixed assets, bank, payroll. Identify key risk areas.',
      priority: 'High',
      dueDaysBefore: 20,
    },
    {
      title: 'Conduct substantive testing and vouching',
      description: 'Perform substantive analytical procedures, test of details, and vouch selected transactions per audit program.',
      priority: 'High',
      dueDaysBefore: 12,
    },
    {
      title: 'Draft Independent Auditor\'s Report',
      description: 'Prepare draft audit report (qualified/unqualified) with all required SA paragraphs and CARO annexure if applicable.',
      priority: 'High',
      dueDaysBefore: 7,
    },
    {
      title: 'Generate UDIN and issue final report',
      description: 'Generate UDIN from ICAI portal, attach to signed report, and issue to client for filing.',
      priority: 'Urgent',
      dueDaysBefore: 3,
    },
  ],

  'Tax (44AB)': [
    {
      title: 'Verify regularity of books of accounts',
      description: 'Check if books are maintained as per applicable law (Section 44AA). Verify completeness of trial balance.',
      priority: 'High',
      dueDaysBefore: 20,
    },
    {
      title: 'Complete clause-wise Form 3CD requirements',
      description: 'Go through all 44 clauses of Form 3CD. Mark applicability, gather data, and draft responses for each applicable clause.',
      priority: 'High',
      dueDaysBefore: 14,
    },
    {
      title: 'Prepare tax audit report (Form 3CA/3CB)',
      description: 'Draft Form 3CA (for statutory audit clients) or Form 3CB (for non-audit clients) along with Form 3CD annexure.',
      priority: 'High',
      dueDaysBefore: 7,
    },
    {
      title: 'Generate UDIN and file tax audit report',
      description: 'Generate UDIN from ICAI portal, upload report on Income Tax e-filing portal, and confirm filing with client.',
      priority: 'Urgent',
      dueDaysBefore: 3,
    },
  ],

  'GST': [
    {
      title: 'Reconcile GSTR-2B vs Purchase Register',
      description: 'Download GSTR-2B from GST portal. Match against purchase register. Identify ITC mismatches, missing invoices, and ineligible credits.',
      priority: 'High',
      dueDaysBefore: 10,
    },
    {
      title: 'Prepare GSTR-1 outward supply data',
      description: 'Compile B2B and B2C invoices, credit/debit notes, and advances from sales register. Validate HSN summary.',
      priority: 'High',
      dueDaysBefore: 7,
    },
    {
      title: 'File GSTR-3B return',
      description: 'Compute output tax, ITC, and net liability. Prepare GSTR-3B JSON/draft, get client approval, and file on GST portal.',
      priority: 'Urgent',
      dueDaysBefore: 3,
    },
    {
      title: 'Flag ITC mismatches and reconciliation report',
      description: 'Prepare ITC reconciliation statement highlighting differences between books, GSTR-2B, and GSTR-3B. Flag reversals needed.',
      priority: 'Normal',
      dueDaysBefore: 1,
    },
  ],

  'Internal': [
    {
      title: 'Define internal audit scope and objectives',
      description: 'Document the scope, objectives, and risk areas for the internal audit engagement.',
      priority: 'High',
      dueDaysBefore: 20,
    },
    {
      title: 'Conduct process walkthroughs and control testing',
      description: 'Perform walkthroughs of key business processes. Test design and operating effectiveness of internal controls.',
      priority: 'High',
      dueDaysBefore: 12,
    },
    {
      title: 'Document observations and recommendations',
      description: 'Prepare observations using ICAI format (criteria, condition, cause, effect, recommendation). Discuss with process owners.',
      priority: 'Normal',
      dueDaysBefore: 7,
    },
    {
      title: 'Issue internal audit report to management',
      description: 'Compile final internal audit report with management responses. Present to audit committee if applicable.',
      priority: 'Normal',
      dueDaysBefore: 3,
    },
  ],

  'Special': [
    {
      title: 'Understand engagement objectives and scope',
      description: 'Review the engagement letter and confirm the specific objectives, scope limitations, and reporting requirements.',
      priority: 'High',
      dueDaysBefore: 20,
    },
    {
      title: 'Perform agreed-upon procedures / investigation',
      description: 'Execute the specific procedures or investigation steps as outlined in the engagement scope.',
      priority: 'High',
      dueDaysBefore: 10,
    },
    {
      title: 'Prepare draft report with findings',
      description: 'Draft the report summarizing findings, conclusions, and recommendations as per the engagement scope.',
      priority: 'Normal',
      dueDaysBefore: 5,
    },
  ],
};

// Document checklists per engagement type for the DataChecklistItem model
const DATA_CHECKLISTS: Record<string, string[]> = {
  'Statutory': [
    'Trial Balance',
    'Bank Statements (all accounts)',
    'Loan Agreements',
    'Fixed Asset Register',
    'Previous Year Audit Report',
    'Schedule of Debtors & Creditors',
    'Stock Statement',
    'Board Resolutions',
  ],
  'Tax (44AB)': [
    'Audited Financials',
    'Books of Accounts',
    'Form 3CA/3CB/3CD Draft Data',
    'Tax Computation (prior year)',
    'TDS Certificates (Form 16A)',
    'Bank Statements',
  ],
  'GST': [
    'Sales Register',
    'Purchase Register',
    'E-way Bills',
    'Credit/Debit Notes',
    'Previous month GSTR returns',
  ],
  'Internal': [
    'Process documentation / SOPs',
    'Organization chart',
    'Previous internal audit reports',
    'Risk register',
  ],
  'Special': [
    'Engagement letter / terms of reference',
    'Relevant financial records',
    'Supporting documentation as specified',
  ],
};

export async function generateSuggestedTasks(
  prisma: PrismaClient,
  engagementId: string,
  engagementType: string,
  assigneeId: string,
  createdById: string,
  deadline: Date | null,
  serviceCode?: string | null
): Promise<number> {
  const serviceTasks = getTasksForService(serviceCode, engagementType);
  const templates = serviceTasks.length > 0 ? serviceTasks : TASK_TEMPLATES[engagementType];
  if (!templates || templates.length === 0) return 0;

  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: { currentStage: true, serviceCode: true, workflowDomain: true, type: true },
  });
  const pipelineEng = {
    currentStage: engagement?.currentStage,
    serviceCode: engagement?.serviceCode ?? serviceCode,
    workflowDomain: engagement?.workflowDomain,
    type: engagement?.type ?? engagementType,
  };

  const now = new Date();
  const baseDeadline = deadline || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const taskData = templates.map((t) => {
    const dueDate = new Date(baseDeadline.getTime() - t.dueDaysBefore * 24 * 60 * 60 * 1000);
    if (dueDate < now) dueDate.setTime(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    return {
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: 'Open' as const,
      dueDate,
      assigneeId,
      createdById,
      engagementId,
      pipelineStage: resolveTaskPipelineStage({ title: t.title, engagement: pipelineEng }),
    };
  });

  const result = await prisma.task.createMany({ data: taskData });
  return result.count;
}

export async function generateDataChecklist(
  prisma: PrismaClient,
  engagementId: string,
  engagementType: string,
  serviceCode?: string | null
): Promise<number> {
  const serviceItems = getChecklistForService(serviceCode, engagementType);
  const fallback = DATA_CHECKLISTS[engagementType] ?? [];
  const items =
    serviceItems.length > 0
      ? serviceItems
      : fallback.map((title) => ({ title }));

  if (!items || items.length === 0) return 0;

  const existing = await prisma.dataChecklistItem.count({ where: { engagementId } });
  if (existing > 0) return 0;

  const data = items.map((item) => ({
    engagementId,
    title: item.title,
    description: (item as { description?: string }).description ?? null,
    status: 'Requested' as const,
  }));

  const result = await prisma.dataChecklistItem.createMany({ data });
  return result.count;
}
