import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import {
  ensureTimerClockIn,
  upsertStaffWorkStatus,
  clearStaffTimerContext,
  syncAttendanceActivity,
} from '../lib/staffWorkStatus.js';

const router = Router();
router.use(authenticate);

/** Convert tracked seconds to billable hours (2 decimal places). */
function secondsToHours(seconds: number): number {
  return Number((Math.max(0, seconds) / 3600).toFixed(2));
}

function effectiveElapsedSeconds(sw: { startedAt: Date; isPaused: boolean; pausedAt: Date | null }): number {
  const end = sw.isPaused && sw.pausedAt ? sw.pausedAt.getTime() : Date.now();
  return Math.max(0, Math.floor((end - sw.startedAt.getTime()) / 1000));
}

/** GET /api/stopwatch/current — my open timer (if any) */
router.get('/current', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sw = await prisma.clientStopwatch.findUnique({
      where: { userId: req.user!.id },
    });
    if (!sw) { res.json(null); return; }
    const engagement = await prisma.engagement.findUnique({
      where: { id: sw.engagementId },
      include: { client: { select: { id: true, name: true } } },
    });
    res.json({
      ...sw,
      engagement,
      elapsedSeconds: effectiveElapsedSeconds(sw),
    });
  } catch (err) {
    logger.error('Get stopwatch error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load stopwatch' });
  }
});

const startSchema = z.object({
  engagementId: z.string().min(1),
  taskId: z.string().optional(),
  workType: z.string().min(1).max(120).default('Audit'),
  notes: z.string().optional(),
});

/** POST /api/stopwatch/start — start timer (does not mark attendance). */
router.post('/start', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = startSchema.parse(req.body);
    const userId = req.user!.id;
    const eng = await prisma.engagement.findFirst({
      where: { id: body.engagementId, firmId: req.user!.firmId! },
    });
    if (!eng) { res.status(404).json({ error: 'Engagement not found' }); return; }

    if (body.taskId) {
      const task = await prisma.task.findFirst({
        where: {
          id: body.taskId,
          assigneeId: userId,
          engagementId: body.engagementId,
        },
      });
      if (!task) {
        res.status(400).json({ error: 'Task not found or not assigned to you on this engagement' });
        return;
      }
    }

    const existing = await prisma.clientStopwatch.findUnique({ where: { userId } });
    if (existing) {
      res.status(409).json({
        error: 'Timer already running. Stop or pause it before starting a new one.',
        stopwatch: existing,
      });
      return;
    }

    const clockIn = await ensureTimerClockIn(userId);

    const now = new Date();
    const sw = await prisma.clientStopwatch.create({
      data: {
        userId,
        engagementId: body.engagementId,
        taskId: body.taskId,
        workType: body.workType,
        notes: body.notes,
        stage: eng.currentStage,
        startedAt: now,
        isPaused: false,
        pausedAt: null,
      },
    });

    await upsertStaffWorkStatus(userId, {
      activityStatus: 'active',
      currentEngagementId: body.engagementId,
      currentStage: eng.currentStage,
      timerStartedAt: now,
      lastActiveAt: now,
      awaySince: null,
    });

    res.json({ ...sw, clockInMarked: clockIn.clockedIn, checkInTime: clockIn.checkIn });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Start stopwatch error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to start stopwatch' });
  }
});

/** POST /api/stopwatch/pause */
router.post('/pause', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const sw = await prisma.clientStopwatch.findUnique({ where: { userId } });
    if (!sw || sw.isPaused) {
      res.status(404).json({ error: 'No running stopwatch' });
      return;
    }
    const updated = await prisma.clientStopwatch.update({
      where: { userId },
      data: { isPaused: true, pausedAt: new Date() },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to pause stopwatch' });
  }
});

/** POST /api/stopwatch/resume */
router.post('/resume', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const sw = await prisma.clientStopwatch.findUnique({ where: { userId } });
    if (!sw || !sw.isPaused || !sw.pausedAt) {
      res.status(404).json({ error: 'No paused stopwatch' });
      return;
    }
    const pauseMs = Date.now() - sw.pausedAt.getTime();
    const updated = await prisma.clientStopwatch.update({
      where: { userId },
      data: {
        isPaused: false,
        pausedAt: null,
        startedAt: new Date(sw.startedAt.getTime() + pauseMs),
      },
    });
    await upsertStaffWorkStatus(userId, { activityStatus: 'active', awaySince: null, lastActiveAt: new Date() });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to resume stopwatch' });
  }
});

/** POST /api/stopwatch/stop — stop and log time entry */
router.post('/stop', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schema = z.object({ description: z.string().optional(), isBillable: z.boolean().optional() });
    const body = schema.parse(req.body);
    const userId = req.user!.id;
    const sw = await prisma.clientStopwatch.findUnique({ where: { userId } });
    if (!sw) { res.status(404).json({ error: 'No active stopwatch' }); return; }

    const endedAt = new Date();
    const seconds = effectiveElapsedSeconds(sw);
    const hours = secondsToHours(seconds);
    const billable = body.isBillable ?? sw.workType !== 'Internal';

    const eng = await prisma.engagement.findUnique({
      where: { id: sw.engagementId },
      select: { currentStage: true },
    });

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.timeEntry.create({
        data: {
          userId,
          engagementId: sw.engagementId,
          taskId: sw.taskId,
          date: endedAt,
          hours,
          workType: sw.workType,
          stage: sw.stage ?? eng?.currentStage ?? null,
          description: body.description || sw.notes,
          isBillable: billable,
          source: 'stopwatch',
          startedAt: sw.startedAt,
          endedAt,
        },
      });
      await tx.clientStopwatch.delete({ where: { userId } });
      return created;
    });

    await clearStaffTimerContext(userId);
    await upsertStaffWorkStatus(userId, { activityStatus: 'active', lastActiveAt: new Date() });

    res.json({ entry, secondsTracked: Math.round(seconds), hoursLogged: hours });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Stop stopwatch error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to stop stopwatch' });
  }
});

/** POST /api/stopwatch/cancel */
router.post('/cancel', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    await prisma.clientStopwatch.deleteMany({ where: { userId } });
    await clearStaffTimerContext(userId);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Cancel stopwatch error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to cancel stopwatch' });
  }
});

export default router;
