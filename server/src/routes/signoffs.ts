import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const signOffSchema = z.object({
  type: z.enum(['Preparer', 'Manager', 'Partner']),
  workpaperId: z.string().uuid().optional(),
  engagementId: z.string().uuid().optional(),
  comments: z.string().optional(),
});

function requireFirmId(req: AuthRequest, res: Response): string | null {
  const firmId = req.user!.firmId;
  if (!firmId) {
    res.status(400).json({ error: 'Your account is not linked to a firm' });
    return null;
  }
  return firmId;
}

// SignOff links to the firm via its engagement, or via its workpaper's engagement
function firmScopeFilter(firmId: string) {
  return [
    { engagement: { firmId } },
    { workpaper: { engagement: { firmId } } },
  ];
}

// GET /api/signoffs?engagementId=xxx or ?workpaperId=xxx
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const { engagementId, workpaperId } = req.query;
    const where: Record<string, unknown> = { OR: firmScopeFilter(firmId) };
    if (engagementId) where.engagementId = String(engagementId);
    if (workpaperId) where.workpaperId = String(workpaperId);

    const signoffs = await prisma.signOff.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, initials: true, role: true } },
        workpaper: { select: { id: true, title: true, reference: true } },
        engagement: { select: { id: true, title: true } },
      },
    });
    res.json(signoffs);
  } catch (err) {
    logger.error('List signoffs error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch signoffs' });
  }
});

// POST /api/signoffs — create a sign-off
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const data = signOffSchema.parse(req.body);
    if (!data.workpaperId && !data.engagementId) {
      res.status(400).json({ error: 'workpaperId or engagementId is required' });
      return;
    }

    if (data.workpaperId) {
      const workpaper = await prisma.workpaper.findFirst({
        where: { id: data.workpaperId, engagement: { firmId } },
        select: { id: true },
      });
      if (!workpaper) {
        res.status(404).json({ error: 'Workpaper not found' });
        return;
      }
    }
    if (data.engagementId) {
      const engagement = await prisma.engagement.findFirst({
        where: { id: data.engagementId, firmId },
        select: { id: true },
      });
      if (!engagement) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }
    }

    const signoff = await prisma.signOff.create({
      data: {
        type: data.type,
        status: 'Pending',
        comments: data.comments,
        workpaperId: data.workpaperId,
        engagementId: data.engagementId,
        userId: req.user!.id,
      },
      include: {
        user: { select: { firstName: true, lastName: true, initials: true, role: true } },
      },
    });
    res.status(201).json(signoff);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    logger.error('Create signoff error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create signoff' });
  }
});

// PATCH /api/signoffs/:id — approve or reject
router.patch('/:id', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const { status, comments } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      res.status(400).json({ error: 'Status must be Approved or Rejected' });
      return;
    }

    const existing = await prisma.signOff.findFirst({
      where: { id: req.params.id, OR: firmScopeFilter(firmId) },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Sign-off not found' });
      return;
    }

    const signoff = await prisma.signOff.update({
      where: { id: existing.id },
      data: {
        status,
        comments: comments || undefined,
        signedAt: status === 'Approved' ? new Date() : null,
      },
      include: {
        user: { select: { firstName: true, lastName: true, initials: true, role: true } },
      },
    });
    res.json(signoff);
  } catch (err) {
    logger.error('Update signoff error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update signoff' });
  }
});

export default router;
