import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { scheduleEmail, sendEmail } from '../lib/emailService.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

/** GET /api/comms/outbox — scheduled and recently processed emails */
router.get('/outbox', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(403).json({ error: 'Firm context required' });
      return;
    }
    const outbox = await prisma.emailOutbox.findMany({
      where: {
        OR: [
          { client: { firmId } },
          { engagement: { firmId } },
        ],
      },
      include: {
        client: { select: { id: true, name: true } },
        engagement: { select: { id: true, title: true } },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 200,
    });
    res.json(outbox);
  } catch (err) {
    logger.error('List email outbox error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load scheduled emails' });
  }
});

/** GET /api/comms — list logs (paginated) */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(403).json({ error: 'Firm context required' });
      return;
    }

    const firmClientIds = await prisma.client.findMany({
      where: { firmId },
      select: { id: true },
    });
    const clientIds = firmClientIds.map((c) => c.id);

    const where: Record<string, unknown> = {
      OR: [
        ...(clientIds.length > 0 ? [{ clientId: { in: clientIds } }] : []),
        { engagement: { firmId } },
      ],
    };
    if (req.query.clientId) where.clientId = String(req.query.clientId);
    if (req.query.engagementId) where.engagementId = String(req.query.engagementId);
    if (req.query.templateKey) where.templateKey = String(req.query.templateKey);
    if (req.query.status) where.status = String(req.query.status);

    const logs = await prisma.commsLog.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        engagement: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(logs);
  } catch (err) {
    logger.error('List comms error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load comms log' });
  }
});

const sendSchema = z.object({
  to: z.string().email(),
  cc: z.string().email().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  clientId: z.string().optional(),
  engagementId: z.string().optional(),
  templateKey: z.string().optional(),
  scheduledAt: z.coerce.date().optional(),
});

/** POST /api/comms/send — ad-hoc send (Partner/Manager) */
router.post(
  '/send',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = sendSchema.parse(req.body);
      const firmId = req.user!.firmId;
      if (!firmId) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }
      if (!body.clientId) {
        res.status(400).json({ error: 'clientId is required' });
        return;
      }
      const client = await prisma.client.findFirst({
        where: { id: body.clientId, firmId },
        select: { id: true },
      });
      if (!client) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      if (body.engagementId) {
        const engagement = await prisma.engagement.findFirst({
          where: { id: body.engagementId, firmId, clientId: body.clientId },
          select: { id: true },
        });
        if (!engagement) {
          res.status(404).json({ error: 'Engagement not found' });
          return;
        }
      }
      const { scheduledAt, ...email } = body;
      const result = scheduledAt
        ? await scheduleEmail(email, scheduledAt)
        : await sendEmail(email);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Send email error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to send email' });
    }
  }
);

/** POST /api/comms/outbox/:id/cancel — cancel a not-yet-sent email */
router.post(
  '/outbox/:id/cancel',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const updated = await prisma.emailOutbox.updateMany({
        where: {
          id: String(req.params.id),
          status: 'scheduled',
          OR: [
            { client: { firmId: req.user!.firmId! } },
            { engagement: { firmId: req.user!.firmId! } },
          ],
        },
        data: { status: 'cancelled' },
      });
      if (updated.count !== 1) {
        res.status(404).json({ error: 'Scheduled email not found or already processed' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error('Cancel scheduled email error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to cancel scheduled email' });
    }
  }
);

export default router;
