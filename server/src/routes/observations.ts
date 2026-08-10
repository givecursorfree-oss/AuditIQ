import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const observationSchema = z.object({
  title: z.string().min(1),
  severity: z.enum(['Critical', 'Moderate', 'Low']).optional(),
  criteria: z.string().optional(),
  condition: z.string().optional(),
  cause: z.string().optional(),
  effect: z.string().optional(),
  recommendation: z.string().optional(),
  managementResponse: z.string().optional(),
  engagementId: z.string().uuid(),
});

const observationUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  severity: z.enum(['Critical', 'Moderate', 'Low']).optional(),
  criteria: z.string().optional(),
  condition: z.string().optional(),
  cause: z.string().optional(),
  effect: z.string().optional(),
  recommendation: z.string().optional(),
  managementResponse: z.string().optional(),
  status: z.enum(['Open', 'Resolved', 'Disputed']).optional(),
});

function requireFirmId(req: AuthRequest, res: Response): string | null {
  const firmId = req.user!.firmId;
  if (!firmId) {
    res.status(400).json({ error: 'Your account is not linked to a firm' });
    return null;
  }
  return firmId;
}

// GET /api/observations?engagementId=xxx
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const { engagementId, severity, status } = req.query;
    const where: Record<string, unknown> = { engagement: { firmId } };
    if (engagementId) where.engagementId = String(engagementId);
    if (severity) where.severity = String(severity);
    if (status) where.status = String(status);

    const observations = await prisma.observation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        engagement: { select: { title: true, client: { select: { name: true } } } },
      },
    });
    res.json(observations);
  } catch (err) {
    logger.error('List observations error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch observations' });
  }
});

// POST /api/observations
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const data = observationSchema.parse(req.body);

    const engagement = await prisma.engagement.findFirst({
      where: { id: data.engagementId, firmId },
      select: { id: true },
    });
    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    const observation = await prisma.observation.create({
      data: {
        title: data.title,
        severity: data.severity || 'Moderate',
        criteria: data.criteria,
        condition: data.condition,
        cause: data.cause,
        effect: data.effect,
        recommendation: data.recommendation,
        managementResponse: data.managementResponse,
        engagementId: data.engagementId,
      },
      include: {
        engagement: { select: { title: true, client: { select: { name: true } } } },
      },
    });
    res.status(201).json(observation);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    logger.error('Create observation error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create observation' });
  }
});

// PATCH /api/observations/:id
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const { title, severity, criteria, condition, cause, effect, recommendation, managementResponse, status } =
      observationUpdateSchema.parse(req.body);

    const existing = await prisma.observation.findFirst({
      where: { id: req.params.id, engagement: { firmId } },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Observation not found' });
      return;
    }

    const observation = await prisma.observation.update({
      where: { id: existing.id },
      data: {
        ...(title && { title }),
        ...(severity && { severity }),
        ...(criteria !== undefined && { criteria }),
        ...(condition !== undefined && { condition }),
        ...(cause !== undefined && { cause }),
        ...(effect !== undefined && { effect }),
        ...(recommendation !== undefined && { recommendation }),
        ...(managementResponse !== undefined && { managementResponse }),
        ...(status && { status }),
      },
      include: {
        engagement: { select: { title: true, client: { select: { name: true } } } },
      },
    });
    res.json(observation);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    logger.error('Update observation error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update observation' });
  }
});

// DELETE /api/observations/:id
router.delete('/:id', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;

    const existing = await prisma.observation.findFirst({
      where: { id: req.params.id, engagement: { firmId } },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Observation not found' });
      return;
    }

    await prisma.observation.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error('Delete observation error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete observation' });
  }
});

export default router;
