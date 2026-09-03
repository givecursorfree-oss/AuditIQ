import prisma from './prisma.js';
import logger from './logger.js';
import { sendEmail, emailTemplates } from './emailService.js';
import { enrichTask } from './taskHelpers.js';

const MANAGER_ROLES = new Set(['Partner', 'Admin', 'Manager', 'Accounts']);

export async function runDailyDigest(now = new Date()): Promise<{ sent: number }> {
  const hour = parseInt(process.env.DIGEST_HOUR || '9', 10);
  const digestWindowHours = parseInt(process.env.DIGEST_CATCHUP_HOURS || '3', 10);
  if (now.getHours() < hour || now.getHours() >= hour + digestWindowHours) return { sent: 0 };

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      notifyDailyDigest: true,
      OR: [{ lastDigestSentAt: null }, { lastDigestSentAt: { lt: todayStart } }],
      role: { not: 'Client' },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      firmId: true,
      firm: { select: { name: true } },
    },
  });

  let sent = 0;
  for (const user of users) {
    if (!user.email || !user.firmId) continue;

    try {
      const sections = await buildDigestSections(user.id, user.role, user.firmId, now);
      const { subject, body } = emailTemplates.dailyDigest({
        firmName: user.firm?.name || 'AuditIQ',
        recipientName: user.firstName,
        date: now,
        sections,
      });

      await sendEmail({ to: user.email, subject, body });
      await prisma.user.update({
        where: { id: user.id },
        data: { lastDigestSentAt: now },
      });
      sent++;
    } catch (err) {
      logger.error('Daily digest failed for user', { userId: user.id, error: (err as Error).message });
    }
  }

  return { sent };
}

async function buildDigestSections(userId: string, role: string, firmId: string, now: Date) {
  const in7 = new Date(now.getTime() + 7 * 86400000);
  const tasks = await prisma.task.findMany({
    where: { assigneeId: userId, status: { notIn: ['completed', 'Done', 'Cancelled'] } },
    include: { engagement: { select: { title: true } } },
  });
  const enriched = tasks.map((t) => enrichTask(t));

  const pendingToday = enriched.filter(
    (t) => t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString()
  );
  const overdue = enriched.filter((t) => t.isOverdue);
  const dueSoon = enriched.filter(
    (t) => t.dueDate && !t.isOverdue && new Date(t.dueDate) <= in7
  );

  const sections: Record<string, unknown> = {
    pendingTasks: pendingToday,
    overdueTasks: overdue,
    tasksDueSoon: dueSoon,
  };

  if (MANAGER_ROLES.has(role)) {
    const attendances = await prisma.attendance.findMany({
      where: { user: { firmId }, date: now },
      select: { status: true },
    });
    sections.attendanceSummary = {
      presentToday: attendances.filter((a) => a.status === 'present' || a.status === 'late').length,
      absentToday: attendances.filter((a) => a.status === 'absent').length,
      awayNow: await prisma.staffWorkStatus.count({
        where: { user: { firmId }, activityStatus: 'away' },
      }),
    };

    const pendingBilling = await prisma.engagement.count({
      where: {
        firmId,
        filedAt: { not: null },
        archivedAt: null,
        currentStage: { not: 'Billing' },
      },
    });
    sections.pendingBillingCount = pendingBilling;

    const pendingClaims =
      (await prisma.lateHoursClaim.count({ where: { status: 'pending', staff: { firmId } } })) +
      (await prisma.deptVisitClaim.count({ where: { status: 'pending', staff: { firmId } } }));
    sections.pendingApprovalsCount = pendingClaims;
  }

  return sections;
}
