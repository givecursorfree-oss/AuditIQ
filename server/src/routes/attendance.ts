import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest, authorize } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import {
  attendanceDayFilter,
  attendanceDayStart,
} from '../lib/attendanceDates.js';
import { ensureTimerClockIn, syncAttendanceActivity } from '../lib/staffWorkStatus.js';

// ICAI articleship leave limits (from articleship.ts but duplicated here to
// avoid a circular runtime dep — values rarely change)
const ICAI_LEAVE_LIMITS = { exam: 175, casual: 30, sick: 15 } as const;

const router = Router();
router.use(authenticate);

// GET /api/attendance/me/today — current user's record for today (confirmation UI)
router.get('/me/today', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const record = await prisma.attendance.findFirst({
      where: { userId: req.user!.id, date: attendanceDayFilter() },
      select: {
        id: true,
        checkIn: true,
        checkOut: true,
        status: true,
        date: true,
        method: true,
      },
    });
    if (!record) {
      res.json(null);
      return;
    }
    const hoursWorked =
      record.checkIn && record.checkOut
        ? +((record.checkOut.getTime() - record.checkIn.getTime()) / 3_600_000).toFixed(2)
        : null;
    res.json({ ...record, hoursWorked });
  } catch (err) {
    logger.error('Today attendance error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch today attendance' });
  }
});

// GET /api/attendance — list attendance records
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, date, month } = req.query;
    const where: Record<string, unknown> = { userId: req.user!.id };

    // Partners/Managers see all firm attendance
    if (['Partner', 'Manager'].includes(req.user!.role)) {
      if (!req.user!.firmId) {
        res.status(400).json({ error: 'Your account is not linked to a firm' });
        return;
      }
      where.user = { firmId: req.user!.firmId };
      if (userId) where.userId = String(userId);
      else delete where.userId;
    }

    if (date) {
      const d = new Date(String(date));
      where.date = d;
    } else if (month) {
      const [y, m] = String(month).split('-').map(Number);
      where.date = {
        gte: new Date(y, m - 1, 1),
        lt: new Date(y, m, 1),
      };
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, initials: true, email: true } },
        office: { select: { name: true } },
      },
    });
    res.json(
      records.map((r) => ({
        ...r,
        hoursWorked:
          r.checkIn && r.checkOut
            ? +((r.checkOut.getTime() - r.checkIn.getTime()) / 3_600_000).toFixed(2)
            : null,
      }))
    );
  } catch (err) {
    logger.error('List attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// POST /api/attendance/punch — toggle in/out depending on state.
// If no record today -> punch in. If record exists without checkOut -> punch out.
router.post('/punch', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dayStart = attendanceDayStart();
    const existing = await prisma.attendance.findFirst({
      where: { userId: req.user!.id, date: attendanceDayFilter() },
    });

    if (!existing) {
      const created = await prisma.attendance.create({
        data: {
          userId: req.user!.id,
          date: dayStart,
          checkIn: new Date(),
          method: req.body?.method || 'manual',
          gpsLat: req.body?.latitude ? parseFloat(req.body.latitude) : null,
          gpsLng: req.body?.longitude ? parseFloat(req.body.longitude) : null,
          officeId: req.body?.officeId || null,
          status: 'present',
        },
      });
      res.json({ action: 'punched-in', record: created });
      return;
    }

    if (!existing.checkOut) {
      const checkOut = new Date();
      const hoursWorked = existing.checkIn
        ? +((checkOut.getTime() - existing.checkIn.getTime()) / 3.6e6).toFixed(2)
        : 0;
      const updated = await prisma.attendance.update({
        where: { id: existing.id },
        data: { checkOut },
      });
      res.json({ action: 'punched-out', record: updated, hoursWorked });
      return;
    }

    res.status(400).json({ error: 'Already punched out for today' });
  } catch (err) {
    logger.error('Punch toggle error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to punch' });
  }
});

// POST /api/attendance/clock-in — first engagement timer start (idempotent per day)
router.post('/clock-in', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await ensureTimerClockIn(req.user!.id);
    res.json(result);
  } catch (err) {
    logger.error('Timer clock-in error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to mark clock-in' });
  }
});

// PATCH /api/attendance/activity — sync active/away seconds (called every ~60s from client)
router.patch('/activity', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      activeSeconds: z.number().int().min(0).default(0),
      awaySeconds: z.number().int().min(0).default(0),
    });
    const body = schema.parse(req.body);
    const updated = await syncAttendanceActivity(req.user!.id, body.activeSeconds, body.awaySeconds);
    res.json({ ok: true, record: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed' });
      return;
    }
    logger.error('Activity sync error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to sync activity' });
  }
});

// GET /api/attendance/report?month=YYYY-MM — monthly attendance summary (admin)
router.get('/report', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const month = String(req.query.month || '');
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) {
      res.status(400).json({ error: 'month query required (YYYY-MM)' });
      return;
    }
    const firmId = req.user!.firmId;
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 1);

    const staff = await prisma.user.findMany({
      where: { firmId: firmId!, isActive: true, role: { in: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'] } },
      select: { id: true, firstName: true, lastName: true },
    });

    const records = await prisma.attendance.findMany({
      where: {
        userId: { in: staff.map((s) => s.id) },
        date: { gte: from, lt: to },
      },
    });

    const timeByUser = await prisma.timeEntry.groupBy({
      by: ['userId'],
      where: {
        userId: { in: staff.map((s) => s.id) },
        date: { gte: from, lt: to },
      },
      _sum: { hours: true },
    });
    const hoursMap = new Map(timeByUser.map((t) => [t.userId, t._sum.hours ?? 0]));

    const HALF_DAY_HOURS = 4;

    res.json(
      staff.map((s) => {
        const userRecords = records.filter((r) => r.userId === s.id);
        const present = userRecords.filter((r) => r.status === 'present' || r.checkIn).length;
        const absent = userRecords.filter((r) => r.status === 'absent').length;
        const halfDay = userRecords.filter((r) => r.status === 'half-day').length;
        const totalActive = userRecords.reduce((sum, r) => sum + (r.totalActiveSeconds ?? 0), 0);
        const totalAway = userRecords.reduce((sum, r) => sum + (r.totalAwaySeconds ?? 0), 0);
        const totalHours = hoursMap.get(s.id) ?? 0;
        const workDays = userRecords.length || 1;

        return {
          staffId: s.id,
          name: `${s.firstName} ${s.lastName}`.trim(),
          present,
          absent,
          halfDay: halfDay || (totalHours > 0 && totalHours < HALF_DAY_HOURS ? 1 : 0),
          totalHours,
          avgActiveSeconds: Math.round(totalActive / workDays),
          avgAwaySeconds: Math.round(totalAway / workDays),
        };
      })
    );
  } catch (err) {
    logger.error('Attendance report error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// POST /api/attendance/check-in
router.post('/check-in', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { method, latitude, longitude, officeId } = req.body;

    const existing = await prisma.attendance.findFirst({
      where: { userId: req.user!.id, date: attendanceDayFilter() },
    });
    if (existing) {
      res.status(400).json({ error: 'Already checked in today' });
      return;
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId: req.user!.id,
        date: attendanceDayStart(),
        checkIn: new Date(),
        method: method || 'manual',
        gpsLat: latitude ? parseFloat(latitude) : null,
        gpsLng: longitude ? parseFloat(longitude) : null,
        officeId: officeId || null,
        status: 'present',
      },
    });
    res.status(201).json(attendance);
  } catch (err) {
    logger.error('Check-in error:', err);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

// POST /api/attendance/check-out
router.post('/check-out', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const attendance = await prisma.attendance.findFirst({
      where: { userId: req.user!.id, date: attendanceDayFilter() },
    });
    if (!attendance) { res.status(404).json({ error: 'No check-in found for today' }); return; }
    if (attendance.checkOut) { res.status(400).json({ error: 'Already checked out' }); return; }

    const checkOut = new Date();
    // Calculate hours in-memory (no totalHours column)
    const hoursWorked = attendance.checkIn
      ? +((checkOut.getTime() - attendance.checkIn.getTime()) / (1000 * 60 * 60)).toFixed(2)
      : 0;

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkOut },
    });
    res.json({ ...updated, hoursWorked });
  } catch (err) {
    logger.error('Check-out error:', err);
    res.status(500).json({ error: 'Failed to check out' });
  }
});

// GET /api/attendance/summary — monthly summary
router.get('/summary', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month } = req.query;
    const now = new Date();
    const [y, m] = month
      ? String(month).split('-').map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);

    const records = await prisma.attendance.findMany({
      where: {
        userId: req.user!.id,
        date: { gte: start, lt: end },
      },
    });

    const totalDays = records.length;
    // Calculate total hours from checkIn/checkOut pairs
    const totalHours = records.reduce((sum, r) => {
      if (r.checkIn && r.checkOut) {
        return sum + (r.checkOut.getTime() - r.checkIn.getTime()) / (1000 * 60 * 60);
      }
      return sum;
    }, 0);
    const presentDays = records.filter(r => r.status === 'present').length;
    const lateDays = records.filter(r => r.status === 'late').length;

    res.json({ totalDays, totalHours: +totalHours.toFixed(1), presentDays, lateDays, records });
  } catch (err) {
    logger.error('Attendance summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ─── Leave Requests ───

const FIRM_LEAVE_ROLES = ['Partner', 'Admin', 'Manager'] as const;

function canViewFirmLeaves(role: string): boolean {
  return (FIRM_LEAVE_ROLES as readonly string[]).includes(role);
}

// GET /api/attendance/leaves/inbox?status=Pending — approver queue
router.get('/leaves/inbox', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!canViewFirmLeaves(req.user!.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const status = req.query.status ? String(req.query.status) : undefined;
    const where: Record<string, unknown> = {
      user: { firmId: req.user!.firmId },
    };
    if (status) where.status = status;

    const leaves = await prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, initials: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
    });
    res.json(leaves);
  } catch (err) {
    logger.error('List leave inbox error:', err);
    res.status(500).json({ error: 'Failed to fetch leave inbox' });
  }
});

// GET /api/attendance/leaves
router.get('/leaves', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const where: Record<string, unknown> = {};
    if (!canViewFirmLeaves(req.user!.role)) {
      where.userId = req.user!.id;
    } else {
      where.user = { firmId: req.user!.firmId };
    }

    const leaves = await prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, initials: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
    });
    res.json(leaves);
  } catch (err) {
    logger.error('List leaves error:', err);
    res.status(500).json({ error: 'Failed to fetch leaves' });
  }
});

// POST /api/attendance/leaves — supports ICAI categories
const leaveCreateSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  type: z.enum(['Casual', 'Sick', 'Earned', 'Holiday', 'Exam', 'Study']),
  examLevel: z.enum(['Foundation', 'Intermediate', 'Final']).optional(),
  reason: z.string().optional(),
});

router.post('/leaves', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role === 'Admin') {
      res.status(403).json({ error: 'Admins cannot apply for leave. Use Leave Management to sanction requests.' });
      return;
    }
    const body = leaveCreateSchema.parse(req.body);
    const from = new Date(body.startDate);
    const to = new Date(body.endDate);
    if (to < from) { res.status(400).json({ error: 'End date must be after start date' }); return; }
    const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1);

    if (body.type === 'Exam' && !body.examLevel) {
      res.status(400).json({ error: 'examLevel is required for Exam leave' });
      return;
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        userId: req.user!.id,
        fromDate: from,
        toDate: to,
        days,
        type: body.type,
        examLevel: body.examLevel,
        reason: body.reason,
      },
    });
    res.status(201).json(leave);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Create leave error:', err);
    res.status(500).json({ error: 'Failed to create leave request' });
  }
});

/**
 * PATCH /api/attendance/leaves/:id
 * Two-step approval: Manager moves Pending -> Manager Approved.
 * Partner moves Manager Approved -> Approved. Either can Reject.
 */
router.patch('/leaves/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = z.object({
      status: z.enum(['Manager Approved', 'Approved', 'Rejected']),
      rejectionReason: z.string().optional(),
    }).parse(req.body);

    const leave = await prisma.leaveRequest.findUnique({
      where: { id: String(String(req.params.id)) },
    });
    if (!leave) { res.status(404).json({ error: 'Leave request not found' }); return; }
    const applicant = await prisma.user.findUnique({
      where: { id: leave.userId },
      select: { id: true, firmId: true },
    });
    if (!applicant || applicant.firmId !== req.user!.firmId) {
      res.status(404).json({ error: 'Leave request not found' });
      return;
    }
    if (leave.userId === req.user!.id) {
      res.status(403).json({ error: 'You cannot approve your own leave' });
      return;
    }

    const role = req.user!.role;
    const data: Record<string, unknown> = { approverId: req.user!.id };

    if (body.status === 'Manager Approved') {
      if (!['Manager', 'Partner', 'Admin'].includes(role)) {
        res.status(403).json({ error: 'Only Manager or above can perform this action' });
        return;
      }
      if (leave.status !== 'Pending') {
        res.status(400).json({ error: `Cannot move from ${leave.status} to Manager Approved` });
        return;
      }
      data.status = 'Manager Approved';
      data.managerApprovedAt = new Date();
      data.managerApprovedBy = req.user!.id;
    } else if (body.status === 'Approved') {
      if (!['Partner', 'Admin'].includes(role)) {
        res.status(403).json({ error: 'Only Partners can grant final approval' });
        return;
      }
      if (leave.status !== 'Manager Approved' && leave.status !== 'Pending') {
        res.status(400).json({ error: `Cannot approve a leave that is ${leave.status}` });
        return;
      }
      data.status = 'Approved';
      data.partnerApprovedAt = new Date();
      data.partnerApprovedBy = req.user!.id;

      // Update articleship leave counters for Article staff
      {
        const counterUpdate: Record<string, unknown> = {};
        if (leave.type === 'Exam') counterUpdate.examLeaveUsed = { increment: leave.days };
        else if (leave.type === 'Casual') counterUpdate.casualLeaveUsed = { increment: leave.days };
        else if (leave.type === 'Sick') counterUpdate.sickLeaveUsed = { increment: leave.days };

        if (Object.keys(counterUpdate).length > 0) {
          await prisma.articleshipRecord
            .update({ where: { userId: leave.userId }, data: counterUpdate })
            .catch(() => null); // No articleship record (non-article staff) — silently skip
        }
      }
    } else {
      // Rejected
      if (!['Manager', 'Partner', 'Admin'].includes(role)) {
        res.status(403).json({ error: 'Only Manager or above can reject' });
        return;
      }
      data.status = 'Rejected';
      data.rejectedAt = new Date();
      data.rejectedBy = req.user!.id;
      data.rejectionReason = body.rejectionReason;
    }

    const updated = await prisma.leaveRequest.update({ where: { id: leave.id }, data });

    // Notify the applicant
    const notifTitle =
      updated.status === 'Approved'
        ? 'Leave sanctioned'
        : updated.status === 'Rejected'
          ? 'Leave rejected'
          : 'Leave updated';
    const notifMessage =
      updated.status === 'Approved'
        ? `Your ${leave.type} leave (${leave.days} day${leave.days > 1 ? 's' : ''}) has been sanctioned.`
        : updated.status === 'Rejected'
          ? `Your ${leave.type} leave (${leave.days} day${leave.days > 1 ? 's' : ''}) was rejected.`
          : `Your ${leave.type} leave (${leave.days} day${leave.days > 1 ? 's' : ''}) was updated to ${updated.status}.`;

    await prisma.notification.create({
      data: {
        userId: leave.userId,
        title: notifTitle,
        message: notifMessage,
        type: updated.status === 'Approved' ? 'success' : updated.status === 'Rejected' ? 'danger' : 'info',
      },
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Update leave error:', err);
    res.status(500).json({ error: 'Failed to update leave request' });
  }
});

// GET /api/attendance/leaves/balance — returns ICAI balance for current user
router.get('/leaves/balance', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.query.userId
      ? String(req.query.userId)
      : req.user!.id;

    if (userId !== req.user!.id && !['Partner', 'Admin', 'Manager'].includes(req.user!.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const articleship = await prisma.articleshipRecord.findUnique({ where: { userId } });
    if (!articleship) {
      // No articleship record => generic balance
      res.json({
        isArticle: false,
        limits: ICAI_LEAVE_LIMITS,
        used: { exam: 0, casual: 0, sick: 0 },
        remaining: ICAI_LEAVE_LIMITS,
      });
      return;
    }
    const used = {
      exam: articleship.examLeaveUsed,
      casual: articleship.casualLeaveUsed,
      sick: articleship.sickLeaveUsed,
    };
    res.json({
      isArticle: true,
      articleshipStart: articleship.startDate,
      articleshipEnd: articleship.expectedEndDate,
      limits: ICAI_LEAVE_LIMITS,
      used,
      remaining: {
        exam: ICAI_LEAVE_LIMITS.exam - used.exam,
        casual: ICAI_LEAVE_LIMITS.casual - used.casual,
        sick: ICAI_LEAVE_LIMITS.sick - used.sick,
      },
    });
  } catch (err) {
    logger.error('Leave balance error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to compute balance' });
  }
});

// GET /api/attendance/leaves/calendar?month=YYYY-MM — approved leaves view
router.get('/leaves/calendar', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const monthStr = String(req.query.month || new Date().toISOString().slice(0, 7));
    const [y, m] = monthStr.split('-').map(Number);
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59);

    const where: Record<string, unknown> = {
      status: 'Approved',
      OR: [
        { fromDate: { gte: from, lte: to } },
        { toDate: { gte: from, lte: to } },
        { AND: [{ fromDate: { lte: from } }, { toDate: { gte: to } }] },
      ],
    };
    if (!['Partner', 'Admin', 'Manager'].includes(req.user!.role)) {
      where.userId = req.user!.id;
    } else {
      where.user = { firmId: req.user!.firmId! };
    }

    const leaves = await prisma.leaveRequest.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } },
      orderBy: { fromDate: 'asc' },
    });
    res.json(leaves);
  } catch (err) {
    logger.error('Leave calendar error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load calendar' });
  }
});

export default router;
