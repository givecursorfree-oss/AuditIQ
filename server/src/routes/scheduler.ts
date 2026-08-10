import { Router, Response } from 'express';
import { authorize, type AuthRequest } from '../middleware/auth.js';
import { runRecurringScheduler, getUpcomingTriggers, getUpcomingTriggersForFirm, RECURRING_SCHEDULE } from '../lib/recurringScheduler.js';
import logger from '../lib/logger.js';
import prisma from '../lib/prisma.js';
import { z } from 'zod';

const router = Router();

// GET /api/scheduler/upcoming
router.get('/upcoming', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const days = Number(req.query.days) || 30;
    const firmId = req.user!.firmId;
    const upcoming = firmId
      ? await getUpcomingTriggersForFirm(firmId, days)
      : getUpcomingTriggers(days).map((u) => ({ ...u, clientName: '', scheduleId: '', nextCreateAt: null }));
    res.json({ schedule: RECURRING_SCHEDULE, upcoming });
  } catch (err) {
    logger.error('Scheduler upcoming error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load upcoming triggers' });
  }
});

// GET /api/scheduler/recurring-clients — clients enrolled in recurring automation
router.get('/recurring-clients', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId!;
    const clients = await prisma.client.findMany({
      where: {
        firmId,
        isActive: true,
        engagements: {
          some: { isRecurring: true, parentEngagementId: null, status: { not: 'Closed' } },
        },
      },
      select: {
        id: true,
        name: true,
        recurringAutomationDisabled: true,
        engagements: {
          where: { isRecurring: true, parentEngagementId: null },
          select: { id: true, title: true, serviceCode: true },
          take: 3,
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(clients);
  } catch (err) {
    logger.error('Scheduler recurring clients error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load recurring clients' });
  }
});

// POST /api/scheduler/run — manual trigger (admin)
router.post(
  '/run',
  authorize('Partner', 'Admin'),
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await runRecurringScheduler();
      res.json(result);
    } catch (err) {
      logger.error('Scheduler run error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to run scheduler' });
    }
  }
);

export default router;
