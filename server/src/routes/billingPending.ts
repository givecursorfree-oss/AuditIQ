import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { sendEmail, emailTemplates } from '../lib/emailService.js';
import { runBillingManagerReminders } from '../lib/billingManagerReminders.js';

const router = Router();
router.use(authenticate);

router.get('/pending', authorize('Partner', 'Admin', 'Manager', 'Accounts'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId!;
    const engagements = await prisma.engagement.findMany({
      where: {
        firmId,
        filedAt: { not: null },
        archivedAt: null,
        OR: [
          { currentStage: { not: 'Billing' } },
          { invoices: { none: { status: { in: ['Paid', 'Partially Paid'] } } } },
        ],
      },
      include: {
        client: { select: { id: true, name: true, contactEmail: true } },
        invoices: { select: { id: true, status: true, totalAmount: true } },
      },
      orderBy: { filedAt: 'asc' },
    });

    const now = Date.now();
    const items = engagements
      .filter((e) => {
        const hasPaid = e.invoices.some((i) => i.status === 'Paid' || i.status === 'Partially Paid');
        return !(e.currentStage === 'Billing' && hasPaid);
      })
      .map((e) => ({
        engagementId: e.id,
        clientId: e.client.id,
        clientName: e.client.name,
        contactEmail: e.client.contactEmail,
        engagementTitle: e.title,
        filedOn: e.filedAt!.toISOString(),
        daysSinceFiling: Math.floor((now - e.filedAt!.getTime()) / 86400000),
        currentStage: e.currentStage,
        invoiceCount: e.invoices.length,
      }));

    res.json(items);
  } catch (err) {
    logger.error('Pending billing error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load pending billing' });
  }
});

async function remindClient(req: AuthRequest, res: Response): Promise<void> {
  try {
    const engagementId = String(req.params.engagementId);
    const eng = await prisma.engagement.findFirst({
      where: { id: engagementId, firmId: req.user!.firmId! },
      include: { client: { include: { firm: true } } },
    });
    if (!eng || !eng.filedAt) {
      res.status(404).json({ error: 'Engagement not found or not filed' });
      return;
    }
    if (!eng.client.contactEmail) {
      res.status(400).json({ error: 'Client has no contact email' });
      return;
    }
    const daysSince = Math.floor((Date.now() - eng.filedAt.getTime()) / 86400000);
    const { subject, body } = emailTemplates.billingReminder({
      firmName: eng.client.firm.name,
      clientName: eng.client.contactName || eng.client.name,
      engagementTitle: eng.title,
      filedOn: eng.filedAt,
      daysSince,
    });
    await sendEmail({
      to: eng.client.contactEmail,
      subject,
      body,
      clientId: eng.clientId,
      engagementId: eng.id,
      templateKey: 'billing_reminder',
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Billing client reminder error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to send reminder' });
  }
}

router.post('/pending/:engagementId/remind-client', authorize('Partner', 'Admin', 'Manager', 'Accounts'), remindClient);
router.post('/pending/:engagementId/remind', authorize('Partner', 'Admin', 'Manager', 'Accounts'), remindClient);

router.post(
  '/pending/:engagementId/remind-manager',
  authorize('Partner', 'Admin', 'Manager', 'Accounts'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const engagementId = String(req.params.engagementId);
      const eng = await prisma.engagement.findFirst({
        where: { id: engagementId, firmId: req.user!.firmId! },
        include: {
          client: { select: { name: true } },
          members: {
            where: { teamRole: 'Manager' },
            include: { user: { select: { id: true, email: true, firstName: true } } },
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
      });
      if (!eng || !eng.filedAt) {
        res.status(404).json({ error: 'Engagement not found or not filed' });
        return;
      }
      const manager =
        eng.members[0]?.user ??
        (eng.managerId
          ? await prisma.user.findUnique({
              where: { id: eng.managerId },
              select: { id: true, email: true, firstName: true },
            })
          : null);
      if (!manager?.email) {
        res.status(400).json({ error: 'No manager assigned on this engagement' });
        return;
      }
      const daysSince = Math.floor((Date.now() - eng.filedAt.getTime()) / 86400000);
      const { subject, body } = emailTemplates.billingManagerReminder({
        managerName: manager.firstName,
        clientName: eng.client.name,
        engagementTitle: eng.title,
        daysSince,
        engagementId: eng.id,
      });
      await sendEmail({ to: manager.email, subject, body, engagementId: eng.id });
      await prisma.notification.create({
        data: {
          userId: manager.id,
          title: 'Pending billing follow-up',
          message: `${eng.client.name} — ${eng.title} needs billing (${daysSince} days since filing).`,
          type: 'warning',
          link: '/billing/pending',
        },
      });
      res.json({ ok: true });
    } catch (err) {
      logger.error('Billing manager reminder error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to notify manager' });
    }
  }
);

router.post(
  '/pending/run-manager-reminders',
  authorize('Partner', 'Admin', 'Manager'),
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      res.json(await runBillingManagerReminders());
    } catch {
      res.status(500).json({ error: 'Failed to run manager reminders' });
    }
  }
);

export default router;
