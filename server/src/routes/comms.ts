import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { sendEmail } from '../lib/emailService.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

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
      const result = await sendEmail({ ...body });
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

export default router;
