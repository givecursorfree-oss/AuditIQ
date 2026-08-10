import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

function dayBounds(dateStr: string) {
  const start = new Date(dateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** GET /api/timesheets?staffId=&date=YYYY-MM-DD */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staffId = String(req.query.staffId || req.user!.id);
    const dateStr = String(req.query.date || new Date().toISOString().slice(0, 10));

    const isSelf = staffId === req.user!.id;
    const isManager = ['Partner', 'Admin', 'Manager'].includes(req.user!.role);
    if (!isSelf && !isManager) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const { start, end } = dayBounds(dateStr);
    const entries = await prisma.timeEntry.findMany({
      where: { userId: staffId, date: { gte: start, lte: end } },
      include: {
        task: { select: { id: true, title: true } },
        engagement: {
          select: { id: true, title: true, client: { select: { name: true } } },
        },
      },
      orderBy: { startedAt: 'asc' },
    });

    const taskMap = new Map<string, { taskId: string; taskName: string; engagementName: string; clientName: string; durationMinutes: number }>();

    let clockInTime: string | null = null;
    let clockOutTime: string | null = null;
    let totalHours = 0;

    for (const e of entries) {
      totalHours += e.hours;
      if (e.startedAt) {
        const iso = e.startedAt.toISOString();
        if (!clockInTime || iso < clockInTime) clockInTime = iso;
      }
      if (e.endedAt) {
        const iso = e.endedAt.toISOString();
        if (!clockOutTime || iso > clockOutTime) clockOutTime = iso;
      }

      const key = e.taskId || `eng:${e.engagementId}`;
      const mins = Math.round(e.hours * 60);
      const existing = taskMap.get(key);
      if (existing) {
        existing.durationMinutes += mins;
      } else {
        taskMap.set(key, {
          taskId: e.taskId || key,
          taskName: e.task?.title || e.workType || 'General work',
          engagementName: e.engagement.title,
          clientName: e.engagement.client.name,
          durationMinutes: mins,
        });
      }
    }

    res.json({
      staffId,
      date: dateStr,
      clockInTime,
      clockOutTime,
      totalHoursWorked: Math.round(totalHours * 100) / 100,
      taskBreakdown: Array.from(taskMap.values()),
    });
  } catch (err) {
    logger.error('Timesheet error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load timesheet' });
  }
});

export default router;
