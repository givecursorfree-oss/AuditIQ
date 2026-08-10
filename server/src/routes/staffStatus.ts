import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest, authorize } from '../middleware/auth.js';
import { attendanceDayFilter } from '../lib/attendanceDates.js';
import { upsertStaffWorkStatus, type ActivityStatus } from '../lib/staffWorkStatus.js';
import logger from '../lib/logger.js';
import { enrichTask } from '../lib/taskHelpers.js';

const router = Router();
router.use(authenticate);

const STAFF_ROLES = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'];

function elapsedSecondsSince(start: Date | null | undefined, isPaused: boolean, pausedAt: Date | null | undefined): number {
  if (!start) return 0;
  const end = isPaused && pausedAt ? pausedAt.getTime() : Date.now();
  return Math.max(0, Math.floor((end - start.getTime()) / 1000));
}

/** GET /api/staff/statuses — live team presence for admin (poll every 15s) */
router.get('/statuses', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.json([]);
      return;
    }

    const staff = await prisma.user.findMany({
      where: { firmId, isActive: true, role: { in: STAFF_ROLES } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        initials: true,
        role: true,
        designation: true,
        presenceStatus: true,
        staffWorkStatus: true,
        clientStopwatches: {
          select: {
            engagementId: true,
            startedAt: true,
            isPaused: true,
            pausedAt: true,
            stage: true,
          },
        },
        attendances: {
          where: { date: attendanceDayFilter() },
          select: { checkIn: true, checkOut: true, totalActiveSeconds: true, totalAwaySeconds: true },
          take: 1,
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const engagementIds = staff
      .flatMap((s) => s.clientStopwatches.map((sw) => sw.engagementId))
      .filter(Boolean);
    const engagements =
      engagementIds.length > 0
        ? await prisma.engagement.findMany({
            where: { id: { in: engagementIds } },
            select: { id: true, title: true, currentStage: true, client: { select: { name: true } } },
          })
        : [];
    const engMap = new Map(engagements.map((e) => [e.id, e]));

    const todayEntries = await prisma.timeEntry.groupBy({
      by: ['userId'],
      where: {
        userId: { in: staff.map((s) => s.id) },
        date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      _sum: { hours: true },
    });
    const hoursMap = new Map(todayEntries.map((e) => [e.userId, e._sum.hours ?? 0]));

    res.json(
      staff.map((s) => {
        const sw = s.clientStopwatches[0];
        const eng = sw ? engMap.get(sw.engagementId) : null;
        const ws = s.staffWorkStatus;
        const att = s.attendances[0];
        // Logged-in staff (presence ≠ offline) show as available even without an active timer
        const isLoggedIn = s.presenceStatus !== 'offline';
        const activityStatus: ActivityStatus = !isLoggedIn
          ? 'offline'
          : ws?.activityStatus === 'away'
            ? 'away'
            : 'active';

        let awayMinutes: number | null = null;
        if (activityStatus === 'away' && ws?.awaySince) {
          awayMinutes = Math.floor((Date.now() - ws.awaySince.getTime()) / 60000);
        }

        return {
          staffId: s.id,
          name: `${s.firstName} ${s.lastName}`.trim(),
          initials: s.initials,
          role: s.role,
          designation: s.designation,
          activityStatus,
          presenceStatus: s.presenceStatus,
          isAvailable: isLoggedIn,
          awayMinutes,
          clockInTime: att?.checkIn?.toISOString() ?? null,
          todayLoggedHours: hoursMap.get(s.id) ?? 0,
          todayActiveSeconds: att?.totalActiveSeconds ?? 0,
          todayAwaySeconds: att?.totalAwaySeconds ?? 0,
          currentEngagement: eng
            ? {
                id: eng.id,
                name: eng.title,
                clientName: eng.client.name,
                stage: sw?.stage ?? eng.currentStage,
              }
            : null,
          timerElapsedSeconds: sw
            ? elapsedSecondsSince(sw.startedAt, sw.isPaused, sw.pausedAt)
            : 0,
          timerIsPaused: sw?.isPaused ?? false,
          updatedAt: ws?.updatedAt?.toISOString() ?? null,
        };
      })
    );
  } catch (err) {
    logger.error('Staff statuses error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load staff statuses' });
  }
});

const statusSchema = z.object({
  activityStatus: z.enum(['active', 'away', 'offline']),
  currentEngagementId: z.string().optional().nullable(),
  currentStage: z.string().optional().nullable(),
});

/** PUT /api/staff/:id/status — update activity status (self or admin) */
router.put('/:id/status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const targetId = String(req.params.id);
    const isSelf = req.user!.id === targetId;
    const isAdmin = ['Partner', 'Admin', 'Manager'].includes(req.user!.role);
    if (!isSelf && !isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const targetUser = await prisma.user.findFirst({
      where: { id: targetId, firmId: req.user!.firmId ?? '__none__', isActive: true },
      select: { id: true },
    });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found in your firm' });
      return;
    }

    const body = statusSchema.parse(req.body);
    const awaySince = body.activityStatus === 'away' ? new Date() : null;

    const updated = await upsertStaffWorkStatus(targetId, {
      activityStatus: body.activityStatus,
      currentEngagementId: body.currentEngagementId ?? undefined,
      currentStage: body.currentStage ?? undefined,
      lastActiveAt: body.activityStatus === 'active' ? new Date() : undefined,
      awaySince,
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Update staff status error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update status' });
  }
});

const MANAGER_ROLES_SCHEDULE = new Set(['Partner', 'Admin', 'Manager']);

function scheduleStartOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function scheduleEndOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** GET /api/staff/:id/schedule?days=14 */
router.get('/:id/schedule', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staffId = String(req.params.id);
    const days = Math.min(30, Math.max(1, parseInt(String(req.query.days || '14'), 10) || 14));

    const isSelf = staffId === req.user!.id;
    const isManager = MANAGER_ROLES_SCHEDULE.has(req.user!.role);
    if (!isSelf && !isManager) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const staff = await prisma.user.findFirst({
      where: { id: staffId, firmId: req.user!.firmId! },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!staff) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }

    const activeTasksRaw = await prisma.task.findMany({
      where: {
        assigneeId: staffId,
        status: { notIn: ['completed', 'Done', 'Cancelled'] },
      },
      include: {
        engagement: {
          select: { id: true, title: true, client: { select: { name: true } } },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
    const activeTasks = activeTasksRaw.map(enrichTask);

    const upcomingDeadlines = activeTasks
      .filter((t) => t.dueDate)
      .map((t) => ({
        taskId: t.id,
        taskName: t.title,
        engagementName: t.engagement?.title ?? '—',
        deadline: t.dueDate!.toISOString(),
      }));

    const weekStart = scheduleStartOfDay(new Date());
    const weekEnd = scheduleEndOfDay(new Date(weekStart.getTime() + 6 * 86400000));
    const weekEntries = await prisma.timeEntry.findMany({
      where: {
        userId: staffId,
        date: { gte: weekStart, lte: weekEnd },
      },
      select: { hours: true },
    });
    const loggedHours = weekEntries.reduce((s, e) => s + e.hours, 0);
    const estimatedRemaining = activeTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
    const workloadHoursThisWeek = Math.round((loggedHours + estimatedRemaining * 0.3) * 10) / 10;

    const availability: { date: string; hoursAllocated: number; isBusy: boolean }[] = [];
    const today = scheduleStartOfDay(new Date());
    for (let i = 0; i < days; i++) {
      const day = new Date(today.getTime() + i * 86400000);
      const tasksDue = activeTasks.filter((t) => {
        if (!t.dueDate) return false;
        const due = scheduleStartOfDay(new Date(t.dueDate));
        return due.getTime() === day.getTime();
      });
      const hoursAllocated = tasksDue.reduce((s, t) => s + (t.estimatedHours ?? 2), 0);
      availability.push({
        date: day.toISOString().slice(0, 10),
        hoursAllocated,
        isBusy: hoursAllocated > 6,
      });
    }

    res.json({
      staffId,
      staff,
      activeTasks,
      upcomingDeadlines,
      workloadHoursThisWeek,
      activeTaskCount: activeTasks.length,
      availability,
    });
  } catch (err) {
    logger.error('Staff schedule error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load staff schedule' });
  }
});

export default router;
