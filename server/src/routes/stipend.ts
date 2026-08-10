import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

// ICAI minimum stipend (per month, INR) — population centre > 20 lakh.
// These are reference defaults; firms can override per-record.
export const ICAI_MIN_STIPEND = {
  1: 4000, // Year 1
  2: 5000, // Year 2
  3: 6000, // Year 3
} as const;

const upsertSchema = z.object({
  userId: z.string().min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  articleYear: z.number().int().min(1).max(5),
  amount: z.number().nonnegative(),
  status: z.enum(['Pending', 'Paid']).default('Pending'),
  notes: z.string().optional(),
});

/** GET /api/stipend?userId=&year=&month= */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const where: Record<string, unknown> = { user: { firmId: req.user!.firmId! } };
    if (req.query.userId) where.userId = String(req.query.userId);
    else if (req.user!.role === 'Staff') where.userId = req.user!.id; // staff sees only own
    if (req.query.year) where.year = Number(req.query.year);
    if (req.query.month) where.month = Number(req.query.month);

    const records = await prisma.stipendRecord.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    res.json({ records, icaiMinimum: ICAI_MIN_STIPEND });
  } catch (err) {
    logger.error('List stipend error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load stipend records' });
  }
});

/** POST /api/stipend — create or update (upsert by user/month/year) */
router.post(
  '/',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = upsertSchema.parse(req.body);
      if (!req.user!.firmId) {
        res.status(400).json({ error: 'Your account is not linked to a firm' });
        return;
      }
      // Target user must belong to the caller's firm
      const target = await prisma.user.findFirst({
        where: { id: body.userId, firmId: req.user!.firmId },
        select: { id: true },
      });
      if (!target) {
        res.status(404).json({ error: 'User not found in your firm' });
        return;
      }
      const data: Record<string, unknown> = {
        ...body,
        paidAt: body.status === 'Paid' ? new Date() : null,
      };
      const record = await prisma.stipendRecord.upsert({
        where: {
          userId_month_year: { userId: body.userId, month: body.month, year: body.year },
        },
        create: data as any,
        update: data as any,
      });
      res.json(record);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Upsert stipend error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to save stipend record' });
    }
  }
);

/** PATCH /api/stipend/:id/mark-paid */
router.patch(
  '/:id/mark-paid',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const existing = await prisma.stipendRecord.findFirst({
        where: { id: String(req.params.id), user: { firmId: req.user!.firmId! } },
      });
      if (!existing) { res.status(404).json({ error: 'Record not found' }); return; }
      const updated = await prisma.stipendRecord.update({
        where: { id: existing.id },
        data: { status: 'Paid', paidAt: new Date() },
      });
      res.json(updated);
    } catch (err) {
      logger.error('Mark stipend paid error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to mark paid' });
    }
  }
);

export default router;
