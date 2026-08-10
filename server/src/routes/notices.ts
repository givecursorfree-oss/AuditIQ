import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { syncClientNotices, getPortalIntegrationStatus } from '../lib/portalSync.js';

const router = Router();
router.use(authenticate);

function dueBucket(dueDate: Date | null, now: Date): 'overdue' | 'due7' | 'due30' | 'later' {
  if (!dueDate) return 'later';
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff <= 7) return 'due7';
  if (diff <= 30) return 'due30';
  return 'later';
}

/** GET /api/notices */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const clientId = req.query.clientId ? String(req.query.clientId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const where: Record<string, unknown> = {
      client: { firmId: req.user!.firmId! },
    };
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    const notices = await prisma.governmentNotice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        engagement: { select: { id: true, title: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(notices);
  } catch (err) {
    logger.error('List notices error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load notices' });
  }
});

/** GET /api/notices/dashboard */
router.get('/dashboard', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notices = await prisma.governmentNotice.findMany({
      where: { client: { firmId: req.user!.firmId! }, status: { not: 'disposed' } },
      select: { portal: true, dueDate: true, adjudicationLevel: true, noticeType: true },
    });

    const now = new Date();
    const portals = ['GST', 'Income_Tax', 'TRACES'] as const;
    const matrix: Record<string, { overdue: number; due7: number; due30: number }> = {};
    const byLevel: Record<string, Record<string, number>> = {};

    for (const p of portals) {
      matrix[p] = { overdue: 0, due7: 0, due30: 0 };
      byLevel[p] = {};
    }

    for (const n of notices) {
      const bucket = dueBucket(n.dueDate, now);
      if (bucket === 'overdue') matrix[n.portal].overdue++;
      else if (bucket === 'due7') matrix[n.portal].due7++;
      else if (bucket === 'due30') matrix[n.portal].due30++;

      const level = n.adjudicationLevel || n.noticeType || 'Other';
      byLevel[n.portal][level] = (byLevel[n.portal][level] || 0) + 1;
    }

    const total = { overdue: 0, due7: 0, due30: 0 };
    for (const p of portals) {
      total.overdue += matrix[p].overdue;
      total.due7 += matrix[p].due7;
      total.due30 += matrix[p].due30;
    }

    res.json({ matrix, total, byLevel, integration: getPortalIntegrationStatus() });
  } catch (err) {
    logger.error('Notice dashboard error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

/** GET /api/notices/:id */
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notice = await prisma.governmentNotice.findFirst({
      where: { id: String(req.params.id), client: { firmId: req.user!.firmId! } },
      include: {
        client: { select: { id: true, name: true } },
        engagement: { select: { id: true, title: true } },
      },
    });
    if (!notice) {
      res.status(404).json({ error: 'Notice not found' });
      return;
    }
    res.json(notice);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load notice' });
  }
});

/** POST /api/notices/sync/:clientId */
router.post('/sync/:clientId', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const clientId = String(req.params.clientId);
    const client = await prisma.client.findFirst({
      where: { id: clientId, firmId: req.user!.firmId! },
    });
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    const result = await syncClientNotices(clientId, req.user!.firmId!);
    res.json(result);
  } catch (err) {
    logger.error('Notice sync error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to sync notices' });
  }
});

/** POST /api/notices — manual create */
router.post('/', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = z
      .object({
        clientId: z.string(),
        portal: z.enum(['GST', 'Income_Tax', 'TRACES']),
        noticeType: z.string(),
        subject: z.string(),
        adjudicationLevel: z.string().optional(),
        referenceNumber: z.string().optional(),
        dateOfNotice: z.string().optional(),
        dueDate: z.string().optional(),
        engagementId: z.string().optional(),
      })
      .parse(req.body);

    const notice = await prisma.governmentNotice.create({
      data: {
        clientId: body.clientId,
        portal: body.portal,
        noticeType: body.noticeType,
        subject: body.subject,
        adjudicationLevel: body.adjudicationLevel,
        referenceNumber: body.referenceNumber,
        dateOfNotice: body.dateOfNotice ? new Date(body.dateOfNotice) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        engagementId: body.engagementId,
        fetchedAt: new Date(),
      },
    });
    res.status(201).json(notice);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to create notice' });
  }
});

export default router;
