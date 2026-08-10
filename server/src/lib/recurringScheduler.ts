import prisma from './prisma.js';
import logger from './logger.js';
import { SERVICE_CATALOG } from './workflowCatalog.js';
import { sendEmail } from './emailService.js';
import {
  buildDefaultTemplateVars,
  renderTemplate,
} from './templateRenderer.js';
import { seedDocumentTemplates } from './documentTemplateSeed.js';
import { scheduleMatchesDate, computeNextCreateAt } from './recurringScheduleHelpers.js';
import { generateSuggestedTasks, generateDataChecklist } from './suggestedTasks.js';
import { getEngagementTeam } from './engagementTeam.js';

export type RecurringScheduleRule = {
  name: string;
  serviceCode: string;
  category: 'DT' | 'IDT';
  triggerDay?: number;
  triggerMonths?: number[]; // 1-12 for quarterly/yearly
  frequency: 'monthly' | 'quarterly' | 'yearly';
  pipelineNote?: string;
  skipPartnerReview?: boolean;
};

export const RECURRING_SCHEDULE: RecurringScheduleRule[] = [
  {
    name: 'GST Monthly Returns Data Request',
    serviceCode: 'GST_MONTHLY_RETURNS',
    category: 'IDT',
    triggerDay: 1,
    frequency: 'monthly',
    skipPartnerReview: true,
  },
  {
    name: 'GSTR-1 Data Request',
    serviceCode: 'GSTR_1',
    category: 'IDT',
    triggerDay: 1,
    frequency: 'monthly',
    skipPartnerReview: true,
  },
  {
    name: 'GSTR-3B Data Request',
    serviceCode: 'GSTR_3B',
    category: 'IDT',
    triggerDay: 14,
    frequency: 'monthly',
    skipPartnerReview: true,
  },
  {
    name: 'Advance Tax',
    serviceCode: 'ADVANCE_TAX',
    category: 'DT',
    triggerMonths: [6, 9, 12, 3],
    triggerDay: 1,
    frequency: 'quarterly',
  },
  {
    name: 'TP Study Report',
    serviceCode: 'TP_STUDY',
    category: 'DT',
    triggerMonths: [12],
    triggerDay: 1,
    frequency: 'yearly',
  },
  {
    name: 'TDS Remittance',
    serviceCode: 'TDS_REMITTANCE',
    category: 'DT',
    triggerDay: 1,
    frequency: 'monthly',
  },
  {
    name: 'TDS Quarterly Return',
    serviceCode: 'TDS_QUARTERLY',
    category: 'DT',
    triggerMonths: [7, 10, 1, 4],
    triggerDay: 1,
    frequency: 'quarterly',
  },
];

function currentFinancialYear(d = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 4) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

function periodLabel(d: Date): string {
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function periodKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ruleMatchesToday(rule: RecurringScheduleRule, now: Date): boolean {
  const day = now.getDate();
  const month = now.getMonth() + 1;
  if (rule.triggerDay && day !== rule.triggerDay) return false;
  if (rule.frequency === 'monthly') return true;
  if (rule.triggerMonths?.length) return rule.triggerMonths.includes(month);
  return false;
}

function serviceTypeForCode(code: string): string {
  const svc = SERVICE_CATALOG.find((s) => s.code === code);
  if (!svc) return 'Special';
  if (svc.domain === 'IDT') return 'GST';
  if (svc.domain === 'DT') return 'Tax (44AB)';
  return 'Statutory';
}

function ruleForServiceCode(code: string): RecurringScheduleRule | undefined {
  return RECURRING_SCHEDULE.find((r) => r.serviceCode === code);
}

/**
 * Spawns recurring engagement periods for enrolled clients using per-client DB schedules.
 * Idempotent per engagement + periodKey.
 */
export async function runRecurringScheduler(now = new Date()): Promise<{
  created: number;
  emailsSent: number;
}> {
  let created = 0;
  let emailsSent = 0;

  const dueSchedules = await prisma.recurringSchedule.findMany({
    where: { isActive: true },
    include: { client: true },
  });

  const matching = dueSchedules.filter((s) => scheduleMatchesDate(s, now));
  if (!matching.length) return { created, emailsSent };

  const firms = await prisma.firm.findMany({ select: { id: true, name: true } });
  const firmMap = new Map(firms.map((f) => [f.id, f]));

  for (const schedule of matching) {
    if (schedule.client.recurringAutomationDisabled) continue;

    const rule = ruleForServiceCode(schedule.engagementTemplateId);
    if (!rule) {
      logger.warn('No catalog rule for recurring schedule', { templateId: schedule.engagementTemplateId });
      continue;
    }

    const firm = firmMap.get(schedule.client.firmId);
    if (!firm) continue;

    await seedDocumentTemplates(prisma, firm.id).catch(() => {});

    const parent = await prisma.engagement.findFirst({
      where: {
        firmId: firm.id,
        clientId: schedule.clientId,
        isRecurring: true,
        parentEngagementId: null,
        status: { not: 'Closed' },
        serviceCode: schedule.engagementTemplateId,
      },
      include: { client: true },
    });
    if (!parent) continue;

    const template = await prisma.documentTemplate.findFirst({
      where: {
        firmId: firm.id,
        category: rule.serviceCode.startsWith('GSTR') || rule.serviceCode === 'GST_MONTHLY_RETURNS'
          ? 'gstr_monthly_letter'
          : rule.serviceCode === 'ADVANCE_TAX'
            ? 'advance_tax_request'
            : rule.serviceCode === 'TP_STUDY'
              ? 'tp_study_request'
              : 'data_request',
        isActive: true,
      },
    });

    const pk = periodKey(now);
    const label = periodLabel(now);
    const fy = parent.financialYear || currentFinancialYear(now);

    const existingPeriod = await prisma.engagementPeriod.findUnique({
      where: { engagementId_periodKey: { engagementId: parent.id, periodKey: pk } },
    });
    if (existingPeriod) continue;

    const childTitle = `${rule.name} — ${parent.client.name} — ${label}`;
    const child = await prisma.engagement.create({
      data: {
        title: childTitle,
        type: serviceTypeForCode(rule.serviceCode),
        financialYear: fy,
        workflowDomain: rule.category,
        serviceCode: rule.serviceCode,
        status: 'Planning',
        currentStage: 'Data Request',
        requestStatus: 'in_progress',
        letterStatus: 'signed',
        isRecurring: true,
        recurringFrequency: rule.frequency,
        period: label,
        parentEngagementId: parent.id,
        firmId: firm.id,
        clientId: parent.clientId,
      },
    });

    await prisma.engagementPeriod.create({
      data: {
        engagementId: parent.id,
        periodKey: pk,
        label,
        currentStage: 'Data Request',
        dueDate: rule.triggerDay
          ? new Date(now.getFullYear(), now.getMonth(), rule.triggerDay + 7)
          : null,
      },
    });

    const nextCreateAt = computeNextCreateAt(schedule, new Date(now.getTime() + 86400000));
    await prisma.recurringSchedule.update({
      where: { id: schedule.id },
      data: { lastCreatedAt: now, nextCreateAt },
    });

    created++;

    try {
      const team = await getEngagementTeam(parent.id);
      const assigneeId =
        team?.primary.article?.id ??
        team?.staff[0]?.id ??
        team?.primary.manager?.id ??
        parent.articleAssistantId ??
        parent.managerId;
      const createdById = parent.partnerInChargeId ?? parent.managerId ?? assigneeId;
      const dueDate = rule.triggerDay
        ? new Date(now.getFullYear(), now.getMonth(), rule.triggerDay + 7)
        : null;
      if (assigneeId && createdById) {
        const taskCount = await generateSuggestedTasks(
          prisma,
          child.id,
          child.type,
          assigneeId,
          createdById,
          dueDate,
          rule.serviceCode
        );
        const checklistCount = await generateDataChecklist(
          prisma,
          child.id,
          child.type,
          rule.serviceCode
        );
        logger.info('Recurring child seeded tasks/checklist', {
          childId: child.id,
          serviceCode: rule.serviceCode,
          taskCount,
          checklistCount,
        });
      }
    } catch (seedErr) {
      logger.error('Failed to seed recurring child tasks', { error: (seedErr as Error).message });
    }

    if (schedule.autoSendDataRequestLetter && template && parent.client.contactEmail) {
      const vars = buildDefaultTemplateVars({
        client: parent.client,
        firm,
        financialYear: fy,
        engagementType: rule.name,
        deadlineDate: rule.triggerDay
          ? `${rule.triggerDay + 7} ${now.toLocaleDateString('en-IN', { month: 'long' })}`
          : undefined,
        date: now,
      });
      const subject = renderTemplate(template.subject, vars);
      const body = renderTemplate(template.body, vars).replace(/\n/g, '<br/>');

      await sendEmail({
        to: parent.client.contactEmail,
        subject,
        body: `<div style="font-family:Arial,sans-serif;line-height:1.5">${body}</div>`,
        clientId: parent.clientId,
        engagementId: child.id,
        templateKey: template.category,
      });
      emailsSent++;
    }

    logger.info('Recurring engagement period created', {
      parentId: parent.id,
      childId: child.id,
      rule: rule.name,
      periodKey: pk,
      scheduleId: schedule.id,
    });
  }

  return { created, emailsSent };
}

/** Seed per-client schedules from catalog for clients with recurring parent engagements. */
export async function seedRecurringSchedulesForFirm(firmId: string, createdById: string): Promise<number> {
  const { RECURRING_SCHEDULE } = await import('./recurringScheduler.js');
  const { ruleToScheduleFields, computeNextCreateAt } = await import('./recurringScheduleHelpers.js');
  let count = 0;
  const clients = await prisma.client.findMany({
    where: { firmId, isActive: true },
    select: { id: true },
  });
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (const client of clients) {
    for (const rule of RECURRING_SCHEDULE) {
      const fields = ruleToScheduleFields(rule);
      const data = {
        engagementTemplateId: rule.serviceCode,
        clientId: client.id,
        isActive: true,
        frequency: fields.frequency,
        triggerDay: fields.triggerDay,
        triggerDates: fields.triggerDates,
        triggerMonth: fields.triggerMonth,
        autoCreateStartDate: start,
        autoCreateEndDate: null as Date | null,
        autoSendDataRequestLetter: true,
        createdById,
      };
      const nextCreateAt = computeNextCreateAt({ ...data, triggerDates: data.triggerDates });
      await prisma.recurringSchedule.upsert({
        where: {
          clientId_engagementTemplateId: {
            clientId: client.id,
            engagementTemplateId: rule.serviceCode,
          },
        },
        create: { ...data, nextCreateAt },
        update: { nextCreateAt },
      });
      count++;
    }
  }
  return count;
}

export function getUpcomingTriggers(daysAhead = 30): Array<{
  date: string;
  rule: RecurringScheduleRule;
  clientName?: string;
  scheduleId?: string;
  nextCreateAt?: string | null;
}> {
  const results: Array<{
    date: string;
    rule: RecurringScheduleRule;
    clientName?: string;
    scheduleId?: string;
    nextCreateAt?: string | null;
  }> = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    for (const rule of RECURRING_SCHEDULE) {
      if (ruleMatchesToday(rule, d)) {
        results.push({
          date: d.toISOString().slice(0, 10),
          rule,
        });
      }
    }
  }
  return results;
}

/** DB-backed upcoming triggers for a firm (per-client schedules). */
export async function getUpcomingTriggersForFirm(
  firmId: string,
  daysAhead = 30
): Promise<
  Array<{
    date: string;
    rule: RecurringScheduleRule;
    clientName: string;
    scheduleId: string;
    nextCreateAt: string | null;
  }>
> {
  const schedules = await prisma.recurringSchedule.findMany({
    where: { isActive: true, client: { firmId } },
    include: { client: { select: { name: true } } },
  });

  const results: Array<{
    date: string;
    rule: RecurringScheduleRule;
    clientName: string;
    scheduleId: string;
    nextCreateAt: string | null;
  }> = [];

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (const schedule of schedules) {
    const rule = ruleForServiceCode(schedule.engagementTemplateId);
    if (!rule) continue;

    for (let i = 0; i <= daysAhead; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      if (scheduleMatchesDate(schedule, d)) {
        results.push({
          date: d.toISOString().slice(0, 10),
          rule,
          clientName: schedule.client.name,
          scheduleId: schedule.id,
          nextCreateAt: schedule.nextCreateAt?.toISOString().slice(0, 10) ?? null,
        });
      }
    }
  }

  results.sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName));
  return results;
}
