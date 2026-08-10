import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { sendEmail, emailTemplates } from '../lib/emailService.js';

const router = Router();
router.use(authenticate);

/** GET /api/billing/pending — filed but not billed */
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
        const billingDone = e.currentStage === 'Billing' && hasPaid;
        return !billingDone;
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

/** POST /api/billing/pending/:engagementId/remind */
router.post(
  '/pending/:engagementId/remind',
  authorize('Partner', 'Admin', 'Manager', 'Accounts'),
  async (req: AuthRequest, res: Response): Promise<void> => {
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
      logger.error('Billing reminder error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to send reminder' });
    }
  }
);

export default router;
