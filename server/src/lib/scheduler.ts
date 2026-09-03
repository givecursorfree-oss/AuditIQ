import prisma from './prisma.js';
import { getEnv } from './env.js';
import logger from './logger.js';
import { sendEmail, emailTemplates, processEmailOutbox } from './emailService.js';
import { syncAllActiveDriveConnections } from './driveSync.js';

const HOUR_MS = 3600 * 1000;
const FOLLOWUP_THRESHOLD_HOURS = 48;
const MAX_FOLLOWUPS_BEFORE_ESCALATION = 3;

/**
 * Background scheduler — runs at SCHEDULER_INTERVAL_MIN. Currently handles:
 *  - Document follow-up emails for missing checklist items >48h
 *  - Marking "Requested" items as "Missing" if past 48h
 *  - Deadline reminder emails (T-7 and T-1)
 *
 * Designed to be idempotent — uses `lastFollowupAt` and `followupCount`
 * to avoid duplicate sends.
 */
export async function runScheduler(): Promise<void> {
  try {
    const outbox = await processEmailOutbox();
    if (outbox.processed > 0) {
      logger.info('Scheduler: processed email outbox', outbox);
    }
    await flagMissingChecklistItems();
    await sendDocumentFollowups();
    await sendDeadlineReminders();
    await syncAllActiveDriveConnections();
    const { runRecurringScheduler } = await import('./recurringScheduler.js');
    const recurring = await runRecurringScheduler();
    if (recurring.created > 0) {
      logger.info(`Scheduler: created ${recurring.created} recurring engagement period(s)`);
    }
    const { runDailyDigest } = await import('./dailyDigest.js');
    const digest = await runDailyDigest();
    if (digest.sent > 0) {
      logger.info(`Scheduler: sent ${digest.sent} daily digest email(s)`);
    }
    const { runBillingManagerReminders } = await import('./billingManagerReminders.js');
    const billingReminders = await runBillingManagerReminders();
    if (billingReminders.notified > 0) {
      logger.info(`Scheduler: sent ${billingReminders.notified} billing manager reminder(s)`);
    }
    const outboxAfter = await processEmailOutbox();
    if (outboxAfter.processed > 0) {
      logger.info('Scheduler: processed newly scheduled emails', outboxAfter);
    }
  } catch (err) {
    logger.error('Scheduler tick failed', { error: (err as Error).message });
  }
}

async function flagMissingChecklistItems(): Promise<void> {
  const cutoff = new Date(Date.now() - FOLLOWUP_THRESHOLD_HOURS * HOUR_MS);
  const result = await prisma.dataChecklistItem.updateMany({
    where: { status: 'Requested', requestedAt: { lt: cutoff } },
    data: { status: 'Missing' },
  });
  if (result.count > 0) logger.info(`Scheduler: flagged ${result.count} checklist items as Missing`);
}

async function sendDocumentFollowups(): Promise<void> {
  const followupCutoff = new Date(Date.now() - FOLLOWUP_THRESHOLD_HOURS * HOUR_MS);

  // Group missing items by engagement; we send one follow-up email per engagement per cycle
  const missing = await prisma.dataChecklistItem.findMany({
    where: {
      status: 'Missing',
      followupCount: { lt: MAX_FOLLOWUPS_BEFORE_ESCALATION },
      OR: [{ lastFollowupAt: null }, { lastFollowupAt: { lt: followupCutoff } }],
    },
    include: {
      engagement: {
        include: {
          client: { include: { firm: true } },
        },
      },
    },
  });

  const byEngagement = new Map<string, typeof missing>();
  for (const item of missing) {
    const list = byEngagement.get(item.engagementId) || [];
    list.push(item);
    byEngagement.set(item.engagementId, list);
  }

  for (const [engagementId, items] of byEngagement) {
    const eng = items[0].engagement;
    const client = eng.client;
    if (!client.contactEmail) continue;

    const attempt = (items[0].followupCount || 0) + 1;
    const { subject, body } = emailTemplates.documentFollowup({
      firmName: client.firm.name,
      clientName: client.contactName || client.name,
      documents: items.map(i => i.title),
      engagementTitle: eng.title,
      attempt,
    });

    await sendEmail({
      to: client.contactEmail,
      subject,
      body,
      clientId: client.id,
      engagementId,
      templateKey: 'document-followup',
      metadata: { attempt, itemCount: items.length },
    });

    await prisma.dataChecklistItem.updateMany({
      where: { id: { in: items.map(i => i.id) } },
      data: { lastFollowupAt: new Date(), followupCount: { increment: 1 } },
    });

    // Escalate to partner if we hit the cap on any item
    const overCap = items.filter(i => attempt >= MAX_FOLLOWUPS_BEFORE_ESCALATION);
    if (overCap.length > 0 && eng.partnerInChargeId) {
      await prisma.notification.create({
        data: {
          userId: eng.partnerInChargeId,
          title: 'Document follow-up escalation',
          message: `${overCap.length} document(s) still missing from ${client.name} for ${eng.title} after ${MAX_FOLLOWUPS_BEFORE_ESCALATION} attempts.`,
          type: 'warning',
          link: `/engagements/${engagementId}`,
        },
      });
      await prisma.dataChecklistItem.updateMany({
        where: { id: { in: overCap.map(i => i.id) } },
        data: { escalatedAt: new Date() },
      });
    }
  }
}

async function sendDeadlineReminders(): Promise<void> {
  const now = new Date();
  const t7 = new Date(now.getTime() + 7 * 24 * HOUR_MS);
  const t1 = new Date(now.getTime() + 24 * HOUR_MS);

  const upcoming = await prisma.deadline.findMany({
    where: {
      status: { in: ['On Track', 'At Risk'] },
      dueDate: { gte: now, lte: t7 },
    },
    include: {
      engagement: {
        include: {
          client: { include: { firm: true } },
          checklistItems: { where: { status: { in: ['Requested', 'Missing'] } } },
        },
      },
    },
  });

  for (const d of upcoming) {
    const days = Math.ceil((d.dueDate.getTime() - now.getTime()) / (24 * HOUR_MS));
    // Only fire at exactly T-7 or T-1 windows (within scheduler interval)
    const shouldSend = days <= 1 || (days >= 6 && days <= 7);
    if (!shouldSend) continue;

    // Check we haven't sent this reminder for this deadline & window already (last 20h)
    const recent = await prisma.commsLog.findFirst({
      where: {
        engagementId: d.engagementId,
        templateKey: 'deadline-reminder',
        metadata: { contains: `"deadlineId":"${d.id}"` },
        sentAt: { gte: new Date(now.getTime() - 20 * HOUR_MS) },
      },
    });
    if (recent) continue;

    const client = d.engagement.client;
    if (!client.contactEmail) continue;
    const { subject, body } = emailTemplates.deadlineReminder({
      firmName: client.firm.name,
      clientName: client.contactName || client.name,
      deadlineTitle: d.title,
      dueDate: d.dueDate,
      daysAway: days,
      pendingDocs: d.engagement.checklistItems.map(i => i.title),
    });
    await sendEmail({
      to: client.contactEmail,
      subject,
      body,
      clientId: client.id,
      engagementId: d.engagementId,
      templateKey: 'deadline-reminder',
      metadata: { deadlineId: d.id, daysAway: days },
    });
  }
}

let schedulerHandle: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (schedulerHandle) return;
  const intervalMs = getEnv().SCHEDULER_INTERVAL_MIN * 60 * 1000;
  logger.info(`Starting scheduler — interval ${intervalMs / 60000} minute(s)`);
  // Stagger the first run so we don't compete with app startup
  setTimeout(() => {
    void runScheduler();
    schedulerHandle = setInterval(() => void runScheduler(), intervalMs);
  }, 30_000);
}

export function stopScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}
