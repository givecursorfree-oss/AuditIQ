import prisma from './prisma.js';
import logger from './logger.js';
import { sendEmail, emailTemplates } from './emailService.js';

const DEFAULT_DAYS = parseInt(process.env.BILLING_MANAGER_REMINDER_DAYS || '7', 10);

export type BillingReminderResult = { notified: number; tasksCreated: number };

/** Notify assigned managers about filed-but-unbilled engagements past threshold. */
export async function runBillingManagerReminders(
  now = new Date(),
  thresholdDays = DEFAULT_DAYS
): Promise<BillingReminderResult> {
  const cutoff = new Date(now.getTime() - thresholdDays * 86400000);
  let notified = 0;
  let tasksCreated = 0;

  const engagements = await prisma.engagement.findMany({
    where: {
      filedAt: { not: null, lte: cutoff },
      archivedAt: null,
      currentStage: { notIn: ['Billing', 'BILLING'] },
    },
    include: {
      client: { select: { name: true } },
      members: {
        where: { teamRole: 'Manager' },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        orderBy: { sortOrder: 'asc' },
        take: 1,
      },
    },
    take: 100,
  });

  for (const eng of engagements) {
    const hasPaid = await prisma.invoice.findFirst({
      where: {
        engagementId: eng.id,
        status: { in: ['Paid', 'Partially Paid'] },
      },
    });
    if (hasPaid) continue;

    const manager =
      eng.members[0]?.user ??
      (eng.managerId
        ? await prisma.user.findUnique({
            where: { id: eng.managerId },
            select: { id: true, email: true, firstName: true, lastName: true },
          })
        : null);

    if (!manager?.email) continue;

    const recentReminder = await prisma.notification.findFirst({
      where: {
        userId: manager.id,
        title: 'Pending billing follow-up',
        message: { contains: eng.title },
        createdAt: { gte: new Date(now.getTime() - thresholdDays * 86400000) },
      },
    });
    if (recentReminder) continue;

    const daysSince = Math.floor((now.getTime() - eng.filedAt!.getTime()) / 86400000);
    const { subject, body } = emailTemplates.billingManagerReminder({
      managerName: manager.firstName,
      clientName: eng.client.name,
      engagementTitle: eng.title,
      daysSince,
      engagementId: eng.id,
    });

    try {
      await sendEmail({ to: manager.email, subject, body, engagementId: eng.id });
      await prisma.notification.create({
        data: {
          userId: manager.id,
          title: 'Pending billing follow-up',
          message: `${eng.client.name} — ${eng.title} filed ${daysSince} days ago, not yet billed.`,
          type: 'warning',
          link: `/billing/pending`,
        },
      });

      if (process.env.BILLING_MANAGER_AUTO_TASK !== 'false') {
        const existing = await prisma.task.findFirst({
          where: {
            engagementId: eng.id,
            title: { contains: 'Billing follow-up' },
            status: { notIn: ['completed', 'Done', 'Cancelled'] },
          },
        });
        if (!existing) {
          await prisma.task.create({
            data: {
              title: `Billing follow-up: ${eng.client.name}`,
              description: `Engagement filed on ${eng.filedAt!.toISOString().slice(0, 10)} — raise invoice and move to Billing stage.`,
              priority: 'High',
              assigneeId: manager.id,
              createdById: manager.id,
              engagementId: eng.id,
              dueDate: new Date(now.getTime() + 2 * 86400000),
              status: 'not_started',
            },
          });
          tasksCreated++;
        }
      }

      notified++;
    } catch (err) {
      logger.error('Billing manager reminder failed', {
        engagementId: eng.id,
        error: (err as Error).message,
      });
    }
  }

  return { notified, tasksCreated };
}
