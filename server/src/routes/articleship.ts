import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

// ICAI articleship leave norms (3-year articleship)
export const ICAI_LEAVE_LIMITS = {
  exam: 175, // total days for all exam attempts across articleship
  casual: 30,
  sick: 15,
};

const recordSchema = z.object({
  userId: z.string().min(1),
  registrationNo: z.string().optional(),
  startDate: z.string(),
  expectedEndDate: z.string(),
});

/** GET /api/articleship/me — current user's articleship record */
router.get('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rec = await prisma.articleshipRecord.findUnique({
      where: { userId: req.user!.id },
    });
    res.json({ record: rec, leaveLimits: ICAI_LEAVE_LIMITS });
  } catch (err) {
    logger.error('Get articleship error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load articleship' });
  }
});

/** GET /api/articleship/:userId — admin view */
router.get(
  '/:userId',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = String(req.params.userId);
      const user = await prisma.user.findFirst({
        where: { id: userId, firmId: req.user!.firmId! },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!user) { res.status(404).json({ error: 'User not found in your firm' }); return; }
      const rec = await prisma.articleshipRecord.findUnique({ where: { userId } });
      if (!rec) { res.status(404).json({ error: 'Articleship not found' }); return; }
      res.json({ record: rec, user, leaveLimits: ICAI_LEAVE_LIMITS });
    } catch (err) {
      logger.error('Get articleship by id error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to load articleship' });
    }
  }
);

/** POST /api/articleship — create / update record */
router.post(
  '/',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = recordSchema.parse(req.body);
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
      const data = {
        userId: body.userId,
        registrationNo: body.registrationNo,
        startDate: new Date(body.startDate),
        expectedEndDate: new Date(body.expectedEndDate),
      };
      const rec = await prisma.articleshipRecord.upsert({
        where: { userId: body.userId },
        create: data,
        update: data,
      });
      res.json(rec);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Save articleship error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to save articleship' });
    }
  }
);

/**
 * GET /api/articleship/e-diary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Builds a copy-paste E-Diary text block matching ICAI SSP Portal format
 * for the requesting user. Defaults to the last 15 days.
 */
router.get('/e-diary/export', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const from = req.query.from
      ? new Date(String(req.query.from))
      : new Date(to.getTime() - 14 * 24 * 3600 * 1000);

    const entries = await prisma.timeEntry.findMany({
      where: {
        userId: req.user!.id,
        date: { gte: from, lte: to },
      },
      include: {
        engagement: { include: { client: { select: { name: true } } } },
      },
      orderBy: { date: 'asc' },
    });

    const lines: string[] = [];
    lines.push(`ICAI E-Diary Export`);
    lines.push(`Period: ${from.toLocaleDateString('en-IN')} to ${to.toLocaleDateString('en-IN')}`);
    lines.push('');
    lines.push('Date         | Client                    | Work Type            | Hours | Description');
    lines.push('-------------|---------------------------|----------------------|-------|---------------------------');
    for (const e of entries) {
      const d = e.date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      lines.push(
        `${d.padEnd(12)} | ${(e.engagement.client.name || '').slice(0, 25).padEnd(25)} | ${(e.workType || 'Audit').slice(0, 20).padEnd(20)} | ${String(e.hours).padStart(5)} | ${e.description || ''}`
      );
    }
    if (entries.length === 0) lines.push('(No entries logged in this period)');
    lines.push('');
    lines.push(`Total entries: ${entries.length}`);
    lines.push(`Total hours: ${entries.reduce((s, e) => s + e.hours, 0).toFixed(2)}`);

    res.type('text/plain').send(lines.join('\n'));
  } catch (err) {
    logger.error('E-Diary export error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to generate E-Diary' });
  }
});

export default router;
