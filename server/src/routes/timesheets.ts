import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { canAttestTimesheets } from '../lib/gradeCapabilities.js';

const router = Router();
router.use(authenticate);

const FIRM_TIMESHEET_ROLES = ['Partner', 'Admin', 'Manager', 'HR'] as const;

function canViewFirmTimesheets(role: string): boolean {
  return (FIRM_TIMESHEET_ROLES as readonly string[]).includes(role);
}

function dayBounds(dateStr: string) {
  const start = new Date(dateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function dateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

async function actorHierarchyCode(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { hierarchyLevel: { select: { code: true } } },
  });
  return u?.hierarchyLevel?.code ?? null;
}

/** GET /api/timesheets?staffId=&date=YYYY-MM-DD */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staffId = String(req.query.staffId || req.user!.id);
    const dateStr = String(req.query.date || new Date().toISOString().slice(0, 10));

    const isSelf = staffId === req.user!.id;
    if (!isSelf && !canViewFirmTimesheets(req.user!.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    if (!isSelf) {
      const peer = await prisma.user.findFirst({
        where: { id: staffId, firmId: req.user!.firmId! },
        select: { id: true },
      });
      if (!peer) {
        res.status(404).json({ error: 'Staff not found in your firm' });
        return;
      }
    }

    const { start, end } = dayBounds(dateStr);
    const dayKey = dateOnly(dateStr);
    const [entries, day] = await Promise.all([
      prisma.timeEntry.findMany({
        where: { userId: staffId, date: { gte: start, lte: end } },
        include: {
          task: { select: { id: true, title: true } },
          engagement: {
            select: { id: true, title: true, client: { select: { name: true } } },
          },
        },
        orderBy: { startedAt: 'asc' },
      }),
      prisma.timesheetDay.findUnique({
        where: { userId_date: { userId: staffId, date: dayKey } },
      }),
    ]);

    const taskMap = new Map<
      string,
      { taskId: string; taskName: string; engagementName: string; clientName: string; durationMinutes: number }
    >();

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
      attestation: day
        ? {
            id: day.id,
            status: day.status,
            submittedAt: day.submittedAt,
            reviewedAt: day.reviewedAt,
            reviewNote: day.reviewNote,
          }
        : { status: 'Draft' },
    });
  } catch (err) {
    logger.error('Timesheet error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load timesheet' });
  }
});

/**
 * GET /api/timesheets/firm?date=YYYY-MM-DD
 * HR / Partner / Admin / Manager: everyone's timesheet + attendance snapshot for the day.
 */
router.get('/firm', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!canViewFirmTimesheets(req.user!.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }

    const dateStr = String(req.query.date || new Date().toISOString().slice(0, 10));
    const { start, end } = dayBounds(dateStr);
    const dayKey = dateOnly(dateStr);

    const staff = await prisma.user.findMany({
      where: { firmId, isActive: true },
      select: { id: true, firstName: true, lastName: true, initials: true, role: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const ids = staff.map((s) => s.id);

    const [hourGroups, attendances, days] = await Promise.all([
      prisma.timeEntry.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, date: { gte: start, lte: end } },
        _sum: { hours: true },
        _count: true,
      }),
      prisma.attendance.findMany({
        where: { userId: { in: ids }, date: { gte: start, lte: end } },
        select: {
          userId: true,
          checkIn: true,
          checkOut: true,
          status: true,
          location: true,
          clientName: true,
          lateBand: true,
        },
      }),
      prisma.timesheetDay.findMany({
        where: { userId: { in: ids }, date: dayKey },
        select: { userId: true, status: true, id: true },
      }),
    ]);

    const hoursByUser = new Map(hourGroups.map((g) => [g.userId, g]));
    const attdByUser = new Map(attendances.map((a) => [a.userId, a]));
    const dayByUser = new Map(days.map((d) => [d.userId, d]));

    res.json({
      date: dateStr,
      rows: staff.map((s) => {
        const h = hoursByUser.get(s.id);
        const a = attdByUser.get(s.id);
        const d = dayByUser.get(s.id);
        return {
          user: s,
          totalHours: Math.round((h?._sum.hours ?? 0) * 100) / 100,
          entryCount: h?._count ?? 0,
          attestationStatus: d?.status ?? 'Draft',
          attestationId: d?.id ?? null,
          attendance: a
            ? {
                checkIn: a.checkIn,
                checkOut: a.checkOut,
                status: a.status,
                location: a.location,
                clientName: a.clientName,
                lateBand: a.lateBand,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    logger.error('Firm timesheets error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load firm timesheets' });
  }
});

/** POST /api/timesheets/submit — staff submits own day for manager attestation */
router.post('/submit', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
    const dayKey = dateOnly(body.date);
    const { start, end } = dayBounds(body.date);
    const hours = await prisma.timeEntry.aggregate({
      where: { userId: req.user!.id, date: { gte: start, lte: end } },
      _sum: { hours: true },
    });
    if (!(hours._sum.hours && hours._sum.hours > 0)) {
      res.status(400).json({ error: 'Log time before submitting the day for approval' });
      return;
    }

    const day = await prisma.timesheetDay.upsert({
      where: { userId_date: { userId: req.user!.id, date: dayKey } },
      create: {
        userId: req.user!.id,
        date: dayKey,
        status: 'Submitted',
        submittedAt: new Date(),
      },
      update: {
        status: 'Submitted',
        submittedAt: new Date(),
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
      },
    });
    res.json(day);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error('Timesheet submit error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to submit timesheet day' });
  }
});

/** GET /api/timesheets/pending-review — Submitted days awaiting attestation */
router.get('/pending-review', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const code = await actorHierarchyCode(req.user!.id);
    if (!canAttestTimesheets(req.user!.role, code)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const firmId = req.user!.firmId!;
    const rows = await prisma.timesheetDay.findMany({
      where: {
        status: 'Submitted',
        user: { firmId, isActive: true },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, initials: true, role: true } },
      },
      orderBy: { submittedAt: 'asc' },
      take: 100,
    });
    res.json(rows);
  } catch (err) {
    logger.error('Pending timesheet review error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load pending reviews' });
  }
});

/** PATCH /api/timesheets/day/:id — Approve | Reject attestation */
router.patch('/day/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const code = await actorHierarchyCode(req.user!.id);
    if (!canAttestTimesheets(req.user!.role, code)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const body = z
      .object({
        status: z.enum(['Approved', 'Rejected']),
        reviewNote: z.string().max(2000).optional(),
      })
      .parse(req.body);

    const existing = await prisma.timesheetDay.findFirst({
      where: { id: req.params.id, user: { firmId: req.user!.firmId! } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Timesheet day not found' });
      return;
    }
    if (existing.status !== 'Submitted') {
      res.status(400).json({ error: `Cannot review from status ${existing.status}` });
      return;
    }
    if (existing.userId === req.user!.id) {
      res.status(400).json({ error: 'Cannot attest your own timesheet' });
      return;
    }

    const updated = await prisma.timesheetDay.update({
      where: { id: existing.id },
      data: {
        status: body.status,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error('Timesheet review error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to review timesheet day' });
  }
});

export default router;
