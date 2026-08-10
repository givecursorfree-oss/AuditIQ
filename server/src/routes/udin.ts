import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  udin: z.string().min(8),
  caName: z.string().min(1),
  clientId: z.string().min(1),
  documentType: z.string().min(1),
  engagementId: z.string().optional(),
});

/** GET /api/udin — list with search/filter; CSV/Excel export via ?format=csv */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const where: Record<string, unknown> = { caUser: { firmId: req.user!.firmId! } };
    const q = req.query.q ? String(req.query.q).trim() : '';
    if (q) {
      where.OR = [
        { udin: { contains: q } },
        { caName: { contains: q } },
        { documentType: { contains: q } },
      ];
    }
    if (req.query.clientId) where.clientId = String(req.query.clientId);
    if (req.query.status) where.status = String(req.query.status);

    const logs = await prisma.udinLog.findMany({
      where,
      include: {
        caUser: { select: { id: true, firstName: true, lastName: true } },
        engagement: { select: { id: true, title: true } },
      },
      orderBy: { generatedAt: 'desc' },
    });

    if (req.query.format === 'csv') {
      const header = 'Date,CA Name,Client ID,Document Type,UDIN,Status\n';
      const rows = logs
        .map((l) =>
          [
            l.generatedAt.toISOString().slice(0, 10),
            l.caName.replace(/,/g, ' '),
            l.clientId,
            l.documentType.replace(/,/g, ' '),
            l.udin,
            l.status,
          ].join(',')
        )
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="udin-log.csv"');
      res.send(header + rows);
      return;
    }

    res.json(logs);
  } catch (err) {
    logger.error('List UDIN error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load UDIN log' });
  }
});

/** POST /api/udin — record a UDIN (Partner only) */
router.post(
  '/',
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = createSchema.parse(req.body);
      const client = await prisma.client.findFirst({
        where: { id: body.clientId, firmId: req.user!.firmId! },
      });
      if (!client) { res.status(404).json({ error: 'Client not found' }); return; }
      const log = await prisma.udinLog.create({
        data: {
          udin: body.udin,
          caName: body.caName,
          caUserId: req.user!.id,
          clientId: body.clientId,
          documentType: body.documentType,
          engagementId: body.engagementId,
        },
      });
      // Auto-update engagement.udin if linked
      if (body.engagementId) {
        await prisma.engagement.updateMany({
          where: { id: body.engagementId, firmId: req.user!.firmId! },
          data: { udin: body.udin, currentStage: 'UDIN Generated' },
        });
        await prisma.engagementStageHistory.create({
          data: {
            engagementId: body.engagementId,
            toStage: 'UDIN Generated',
            notes: `UDIN ${body.udin} recorded`,
            actorId: req.user!.id,
          },
        });
      }
      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Create UDIN error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to record UDIN' });
    }
  }
);

/** PATCH /api/udin/:id/revoke */
router.patch(
  '/:id/revoke',
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = z.object({ reason: z.string().optional() }).parse(req.body);
      const existing = await prisma.udinLog.findFirst({
        where: { id: String(req.params.id), caUser: { firmId: req.user!.firmId! } },
      });
      if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
      const updated = await prisma.udinLog.update({
        where: { id: existing.id },
        data: { status: 'Revoked', revokedAt: new Date(), revokeReason: body.reason },
      });
      res.json(updated);
    } catch (err) {
      logger.error('Revoke UDIN error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to revoke UDIN' });
    }
  }
);

export default router;
