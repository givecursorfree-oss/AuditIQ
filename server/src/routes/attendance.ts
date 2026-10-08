import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest, authorize } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import {
  attendanceDayFilter,
  attendanceDayStart,
  getAttendanceDateKey,
  pickOpenAttendanceSession,
  pickResumableAttendanceSession,
} from '../lib/attendanceDates.js';
import {
  loadMeTodayAttendance,
  loadTodayAndYesterdayAttendance,
} from '../lib/attendanceSession.js';
import { ensureTimerClockIn, syncAttendanceActivity } from '../lib/staffWorkStatus.js';
import { taskDerivedHoursForDay } from '../lib/taskAttendanceSync.js';
import { GeofenceError, GpsAccuracyError, resolveOfficeCheckIn } from '../lib/geofence.js';
import {
  classifyLateBand,
  statusFromLateBand,
  PLACE_CLIENT,
  PLACE_OFFICE,
  PLACE_WFH,
  ARTICLE_FIRM_LEAVE_DAYS,
  type PlaceOfWork,
} from '../lib/articleAttendancePolicy.js';
import {
  computeArticleAttendanceDebit,
  hasWfhApproval,
  userIsArticleAssistant,
} from '../lib/articleAttendanceCompute.js';
import { clientIp } from '../lib/clientIp.js';
import { sendEmail } from '../lib/emailService.js';
import { listLookupValues, LOOKUP_CLIENT } from '../lib/hrLookups.js';
import { leaveRecipientsFor } from '../lib/leaveNotify.js';
import { leaveMailActionButtonsHtml } from '../lib/leaveMailAction.js';
import { applyLeaveDecision, canManagerApproveLeave } from '../lib/leaveDecision.js';
import { leaveRequestDays } from '../lib/leaveRequestDays.js';
import { normalizeEmail } from '../lib/emailNormalize.js';

// ICAI articleship leave limits (from articleship.ts but duplicated here to
// avoid a circular runtime dep — values rarely change)
const ICAI_LEAVE_LIMITS = { exam: 175, casual: 30, sick: 15 } as const;

/** Coarse home/client GPS often reports large radii — store + soft-cap, not office geofence. */
const MAX_REMOTE_GPS_ACCURACY_M = 15_000;

const HR_ATTENDANCE_ROLES = ['Partner', 'Admin', 'Manager', 'HR'] as const;

/** Roles that see firm-wide attendance / leave queues (nav Leave Management for HR). */
const FIRM_PEOPLE_ROLES = ['Partner', 'Admin', 'Manager', 'HR'] as const;

function canViewFirmAttendance(role: string): boolean {
  return (FIRM_PEOPLE_ROLES as readonly string[]).includes(role);
}

const checkInBodySchema = z
  .object({
    method: z.string().optional(),
    officeId: z.string().optional(),
    placeOfWork: z
      .enum([PLACE_OFFICE, PLACE_CLIENT, PLACE_WFH])
      .optional()
      .default(PLACE_OFFICE),
    clientName: z.string().max(200).optional(),
    latitude: z.coerce.number().gte(-90).lte(90).optional(),
    longitude: z.coerce.number().gte(-180).lte(180).optional(),
    /** Device-reported GPS accuracy in meters (required for Office). */
    accuracyMeters: z.coerce.number().positive().optional(),
  })
  .superRefine((val, ctx) => {
    const remote = val.placeOfWork === PLACE_CLIENT || val.placeOfWork === PLACE_WFH;
    if (val.placeOfWork === PLACE_OFFICE || remote) {
      if (val.latitude == null || val.longitude == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            val.placeOfWork === PLACE_OFFICE
              ? 'Location is required for Office check-in'
              : 'Location is required for Client Place and Work from Home check-in',
          path: ['latitude'],
        });
      }
    }
    if (val.placeOfWork === PLACE_OFFICE && val.accuracyMeters == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'GPS accuracy is required for Office check-in. Use your phone with Precise Location on.',
        path: ['accuracyMeters'],
      });
    }
    if (
      remote &&
      val.accuracyMeters != null &&
      val.accuracyMeters > MAX_REMOTE_GPS_ACCURACY_M
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Location accuracy is too coarse (±${Math.round(val.accuracyMeters)}m). Enable Precise Location and try again.`,
        path: ['accuracyMeters'],
      });
    }
  });

/** Legacy punch still requires GPS at office. */
const checkInGpsSchema = z.object({
  method: z.string().optional(),
  officeId: z.string().optional(),
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
  accuracyMeters: z.coerce.number().positive().optional(),
});

function geofenceOrValidation(err: unknown, res: Response): boolean {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: err.errors[0]?.message || 'Location is required to check in' });
    return true;
  }
  if (err instanceof GpsAccuracyError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  if (err instanceof GeofenceError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

const router = Router();
router.use(authenticate);

// GET /api/attendance/me/today — today's row, or yesterday's still-open overnight session
router.get('/me/today', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const picked = await loadMeTodayAttendance(req.user!.id);
    if (!picked) {
      res.json(null);
      return;
    }
    const { record, overnight } = picked;
    const hoursWorked =
      record.checkIn && record.checkOut
        ? +((record.checkOut.getTime() - record.checkIn.getTime()) / 3_600_000).toFixed(2)
        : null;
    const dateKey = getAttendanceDateKey(record.date);
    const taskDerivedHours = await taskDerivedHoursForDay(req.user!.id, dateKey);
    const isArticle = await userIsArticleAssistant(req.user!.id);
    res.json({
      ...record,
      hoursWorked,
      taskDerivedHours,
      totalActiveHours: +(record.totalActiveSeconds / 3600).toFixed(2),
      isArticle,
      overnightContinuation: overnight,
    });
  } catch (err) {
    logger.error('Today attendance error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch today attendance' });
  }
});

const YMD = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/attendance — list attendance records
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, date, month, from, to } = req.query;
    const where: Record<string, unknown> = { userId: req.user!.id };

    // Partners / Managers / Admin / HR see firm-wide attendance
    if (canViewFirmAttendance(req.user!.role)) {
      if (!req.user!.firmId) {
        res.status(400).json({ error: 'Your account is not linked to a firm' });
        return;
      }
      where.user = { firmId: req.user!.firmId };
      if (userId) where.userId = String(userId);
      else delete where.userId;
    }

    if (from || to) {
      const fromKey = from ? String(from) : '';
      const toKey = to ? String(to) : '';
      if ((fromKey && !YMD.test(fromKey)) || (toKey && !YMD.test(toKey))) {
        res.status(400).json({ error: 'from/to must use YYYY-MM-DD format' });
        return;
      }
      if (fromKey && toKey && fromKey > toKey) {
        res.status(400).json({ error: 'from must be on or before to' });
        return;
      }
      const range: { gte?: Date; lt?: Date } = {};
      if (fromKey) range.gte = new Date(`${fromKey}T00:00:00+05:30`);
      if (toKey) {
        const [y, m, d] = toKey.split('-').map(Number);
        const next = new Date(y, m - 1, d + 1);
        const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
        range.lt = new Date(`${nextKey}T00:00:00+05:30`);
      }
      where.date = range;
    } else if (date) {
      const dateKey = String(date);
      if (!YMD.test(dateKey)) {
        res.status(400).json({ error: 'date must use YYYY-MM-DD format' });
        return;
      }
      // Attendance dates are stored at the start of the IST calendar day.
      where.date = attendanceDayFilter(new Date(`${dateKey}T12:00:00+05:30`));
    } else if (month) {
      const monthKey = String(month);
      const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
      if (!match) {
        res.status(400).json({ error: 'month must use YYYY-MM format' });
        return;
      }
      const year = Number(match[1]);
      const monthNumber = Number(match[2]);
      if (monthNumber < 1 || monthNumber > 12) {
        res.status(400).json({ error: 'month must use YYYY-MM format' });
        return;
      }
      const monthStart = new Date(`${monthKey}-01T00:00:00+05:30`);
      const nextMonth = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
      const monthEnd = new Date(`${nextMonth}-01T00:00:00+05:30`);
      where.date = { gte: monthStart, lt: monthEnd };
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            initials: true,
            email: true,
            role: true,
            designation: true,
            hierarchyLevel: { select: { title: true } },
          },
        },
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
      if (!req.user!.firmId) {
        res.status(400).json({ error: 'Your account is not linked to a firm' });
        return;
      }
      const gps = checkInGpsSchema.parse(req.body);
      const fence = await resolveOfficeCheckIn(
        req.user!.firmId,
        gps.latitude,
        gps.longitude,
        gps.accuracyMeters
      );
      const created = await prisma.attendance.create({
        data: {
          userId: req.user!.id,
          date: dayStart,
          checkIn: new Date(),
          method: gps.method || 'manual',
          gpsLat: gps.latitude,
          gpsLng: gps.longitude,
          gpsAccuracy: gps.accuracyMeters ?? null,
          officeId: fence.officeId,
          location: 'Office',
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
    if (geofenceOrValidation(err, res)) return;
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
router.get('/report', authorize('Partner', 'Admin', 'Manager', 'HR'), async (req: AuthRequest, res: Response): Promise<void> => {
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
    const { today: existing, yesterday } = await loadTodayAndYesterdayAttendance(req.user!.id);
    if (yesterday?.checkIn && !yesterday.checkOut) {
      res.status(400).json({
        error: 'Yesterday’s day is still open past midnight. Use End day to mark Out Time first.',
      });
      return;
    }
    if (existing?.checkIn) {
      if (existing.checkOut) {
        res.status(400).json({
          error: 'Day already ended. Use Resume day to continue working.',
        });
        return;
      }
      res.json({ ...existing, alreadyCheckedIn: true });
      return;
    }
    if (!req.user!.firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }

    const body = checkInBodySchema.parse(req.body);
    const place = body.placeOfWork as PlaceOfWork;
    const isArticle = await userIsArticleAssistant(req.user!.id);
    const now = new Date();

    let officeId: string | undefined;
    let gpsLat: number | undefined;
    let gpsLng: number | undefined;
    let gpsAccuracy: number | undefined;
    let wfhApprovedById: string | undefined;
    const checkInIp = clientIp(req) ?? null;

    // Office: geofence. Client / WFH: require GPS + store IP (no office pin).
    const needsGeofence = place === PLACE_OFFICE;
    const needsRemoteGps = place === PLACE_CLIENT || place === PLACE_WFH;
    if (needsGeofence) {
      if (body.latitude == null || body.longitude == null) {
        res.status(400).json({ error: 'Location is required for Office check-in' });
        return;
      }
      const fence = await resolveOfficeCheckIn(
        req.user!.firmId,
        body.latitude,
        body.longitude,
        body.accuracyMeters
      );
      officeId = fence.officeId;
      gpsLat = body.latitude;
      gpsLng = body.longitude;
      gpsAccuracy = body.accuracyMeters;
    } else if (needsRemoteGps) {
      if (body.latitude == null || body.longitude == null) {
        res.status(400).json({
          error: 'Location is required for Client Place and Work from Home check-in',
        });
        return;
      }
      if (body.accuracyMeters != null && body.accuracyMeters > MAX_REMOTE_GPS_ACCURACY_M) {
        res.status(400).json({
          error: `Location accuracy is too coarse (±${Math.round(body.accuracyMeters)}m). Enable Precise Location and try again.`,
        });
        return;
      }
      gpsLat = body.latitude;
      gpsLng = body.longitude;
      gpsAccuracy = body.accuracyMeters;
    } else {
      gpsLat = body.latitude;
      gpsLng = body.longitude;
      gpsAccuracy = body.accuracyMeters;
    }

    if (isArticle && place === PLACE_WFH) {
      const wfh = await hasWfhApproval(req.user!.id, now);
      if (!wfh.ok) {
        res.status(403).json({
          error:
            'WFH requires manager approval for today. Ask your manager to approve Work from Home first.',
        });
        return;
      }
      wfhApprovedById = wfh.approvedById;
    }

    if (place === PLACE_CLIENT && !body.clientName?.trim()) {
      res.status(400).json({ error: 'Client name is required for Client Place check-in' });
      return;
    }

    let canonicalClient: string | null = null;
    if (place === PLACE_CLIENT) {
      const firmId = req.user!.firmId;
      if (!firmId) {
        res.status(400).json({ error: 'Your account is not linked to a firm' });
        return;
      }
      const allowed = await listLookupValues(firmId, LOOKUP_CLIENT);
      canonicalClient =
        allowed.find((name) => name.trim().toLowerCase() === body.clientName!.trim().toLowerCase()) || null;
      if (!canonicalClient) {
        res.status(400).json({ error: 'Select a client from the firm list' });
        return;
      }
    }

    const lateBand = isArticle ? classifyLateBand(now) : 'on_time';
    const status = isArticle ? statusFromLateBand(lateBand) : 'present';

    const data = {
      checkIn: now,
      method: body.method || 'manual',
      gpsLat: gpsLat ?? null,
      gpsLng: gpsLng ?? null,
      gpsAccuracy: gpsAccuracy ?? null,
      ipAddress: checkInIp,
      officeId: officeId ?? null,
      location: place,
      clientName: canonicalClient,
      lateBand: isArticle ? lateBand : null,
      status,
      wfhApprovedById: wfhApprovedById ?? null,
    };

    if (existing) {
      const attendance = await prisma.attendance.update({
        where: { id: existing.id },
        data,
      });
      res.json({ ...attendance, isArticle });
      return;
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId: req.user!.id,
        date: attendanceDayStart(),
        ...data,
      },
    });
    res.status(201).json({ ...attendance, isArticle });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message || 'Invalid check-in data' });
      return;
    }
    if (geofenceOrValidation(err, res)) return;
    logger.error('Check-in error:', err);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

// POST /api/attendance/check-out — today, or yesterday if still open past midnight
router.post('/check-out', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { today, yesterday } = await loadTodayAndYesterdayAttendance(req.user!.id);
    const open = pickOpenAttendanceSession(today, yesterday);
    if (!open) {
      if (today?.checkIn && today.checkOut) {
        res.status(400).json({ error: 'Already checked out' });
        return;
      }
      res.status(404).json({
        error: 'No open check-in found. Check in first, or end yesterday’s day if it is still open.',
      });
      return;
    }

    const attendance = open.record;
    const checkOut = new Date();
    const hoursWorked = attendance.checkIn
      ? +((checkOut.getTime() - attendance.checkIn.getTime()) / (1000 * 60 * 60)).toFixed(2)
      : 0;

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkOut },
    });
    res.json({ ...updated, hoursWorked, overnightContinuation: open.overnight });
  } catch (err) {
    logger.error('Check-out error:', err);
    res.status(500).json({ error: 'Failed to check out' });
  }
});

/** Clears check-out so staff can keep working (today, or overnight session ended past midnight). */
router.post('/resume', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { today, yesterday } = await loadTodayAndYesterdayAttendance(req.user!.id);
    const picked = pickResumableAttendanceSession(today, yesterday);
    if (!picked?.record.checkIn) {
      res.status(404).json({ error: 'No check-in found to resume' });
      return;
    }
    const attendance = picked.record;
    if (!attendance.checkOut) {
      res.json({ ...attendance, alreadyOpen: true, overnightContinuation: picked.overnight });
      return;
    }
    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkOut: null },
    });
    res.json({ ...updated, resumed: true, overnightContinuation: picked.overnight });
  } catch (err) {
    logger.error('Resume attendance error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to resume day' });
  }
});

// POST /api/attendance/wfh-approvals — manager pre-approves Article WFH for a date
router.post('/wfh-approvals', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!HR_ATTENDANCE_ROLES.includes(req.user!.role as (typeof HR_ATTENDANCE_ROLES)[number])) {
      res.status(403).json({ error: 'Only Manager / Partner / Admin / HR can approve WFH' });
      return;
    }
    const schema = z.object({
      userId: z.string().uuid(),
      date: z.string().min(8), // YYYY-MM-DD
      note: z.string().max(500).optional(),
    });
    const body = schema.parse(req.body);
    if (!(await userIsArticleAssistant(body.userId))) {
      res.status(400).json({ error: 'WFH approval applies to Article Assistants only' });
      return;
    }
    const dayStart = attendanceDayStart(new Date(`${body.date}T12:00:00+05:30`));
    const row = await prisma.wfhApproval.upsert({
      where: { userId_date: { userId: body.userId, date: dayStart } },
      create: {
        userId: body.userId,
        date: dayStart,
        approvedById: req.user!.id,
        note: body.note,
      },
      update: {
        approvedById: req.user!.id,
        note: body.note,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('WFH approval error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to approve WFH' });
  }
});

// PATCH /api/attendance/:id/forgive — same-month mail exception (HR)
router.patch('/:id/forgive', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!HR_ATTENDANCE_ROLES.includes(req.user!.role as (typeof HR_ATTENDANCE_ROLES)[number])) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const schema = z.object({ reason: z.string().min(1).max(500) });
    const { reason } = schema.parse(req.body);
    const record = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!record) {
      res.status(404).json({ error: 'Attendance record not found' });
      return;
    }
    const now = new Date();
    // Same calendar month in IST only (HR: mail forgiveness within the month)
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
    }).format(record.date);
    const nowKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
    }).format(now);
    if (key !== nowKey) {
      res.status(400).json({
        error: 'Mail forgiveness is only allowed in the same calendar month as the attendance day',
      });
      return;
    }
    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: {
        forgiven: true,
        forgivenReason: reason,
        forgivenById: req.user!.id,
      },
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Forgive attendance error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to forgive attendance' });
  }
});

// PATCH /api/attendance/:id/bio — mark biometric present (until Bio import exists)
router.patch('/:id/bio', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!HR_ATTENDANCE_ROLES.includes(req.user!.role as (typeof HR_ATTENDANCE_ROLES)[number])) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const schema = z.object({ bioPresent: z.boolean() });
    const { bioPresent } = schema.parse(req.body);
    const updated = await prisma.attendance.update({
      where: { id: req.params.id },
      data: { bioPresent },
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed' });
      return;
    }
    logger.error('Bio mark error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update bio flag' });
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

    const isArticle = await userIsArticleAssistant(req.user!.id);
    let articlePolicy = null;
    if (isArticle) {
      const debit = await computeArticleAttendanceDebit(req.user!.id, { from: start, to: end });
      articlePolicy = {
        softLateCount: debit.softLateCount,
        hardLateCount: debit.hardLateCount,
        noAttdCount: debit.noAttdCount,
        lateDebitDays: debit.lateDebitDays,
        noAttdDebitDays: debit.noAttdDebitDays,
        totalDebitDays: debit.totalDebitDays,
      };
    }

    res.json({
      totalDays,
      totalHours: +totalHours.toFixed(1),
      presentDays,
      lateDays,
      records,
      isArticle,
      articlePolicy,
    });
  } catch (err) {
    logger.error('Attendance summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ─── Leave Requests ───

const FIRM_LEAVE_ROLES = ['Partner', 'Admin', 'Manager', 'HR'] as const;

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

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notifyLeaveSubmitted(
  userId: string,
  leave: { id: string; fromDate: Date; toDate: Date; days: number; type: string; reason: string | null; halfDay?: boolean }
): Promise<void> {
  const applicant = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      designation: true,
      firmId: true,
      hierarchyLevel: { select: { code: true, title: true } },
      articleship: { select: { id: true } },
    },
  });
  if (!applicant?.firmId) return;
  const recipients = leaveRecipientsFor({
    hierarchyCode: applicant.hierarchyLevel?.code,
    hierarchyTitle: applicant.hierarchyLevel?.title,
    designation: applicant.designation,
    hasArticleship: Boolean(applicant.articleship),
    role: applicant.role,
  });
  if (!recipients?.length) return;

  const name = `${applicant.firstName} ${applicant.lastName}`.trim();
  const title = applicant.hierarchyLevel?.title || applicant.designation || '';
  const when = leave.fromDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  const until = leave.toDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  const bodyCore = `<p>${escapeHtml(name)}${title ? ` (${escapeHtml(title)})` : ''} submitted a ${escapeHtml(leave.type)} leave application${leave.halfDay ? ' (half day)' : ''}.</p><p>${escapeHtml(when)} to ${escapeHtml(until)} · ${leave.days} day(s)</p>${leave.reason ? `<p>${escapeHtml(leave.reason)}</p>` : ''}<p><a href="mailto:${escapeHtml(applicant.email)}">${escapeHtml(applicant.email)}</a></p>`;

  const recipientUsers = await prisma.user.findMany({
    where: {
      firmId: applicant.firmId,
      isActive: true,
      email: { in: recipients.map((email) => normalizeEmail(email)) },
    },
    select: { id: true, email: true, role: true },
  });
  const byEmail = new Map(recipientUsers.map((u) => [normalizeEmail(u.email), u]));

  await Promise.all(
    recipients.map(async (email) => {
      const actor = byEmail.get(normalizeEmail(email));
      const actionHtml = actor
        ? leaveMailActionButtonsHtml({
            leaveId: leave.id,
            userId: actor.id,
            includeDecide: canManagerApproveLeave(actor.role),
          })
        : '';
      await sendEmail({
        to: email,
        subject: `Leave application — ${name}`,
        body: `${bodyCore}${actionHtml}`,
      });
    })
  );
}

// POST /api/attendance/leaves — supports ICAI categories
const leaveCreateSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  type: z.enum(['Casual', 'Sick', 'Earned', 'Holiday', 'Exam', 'Study']),
  examLevel: z.enum(['Foundation', 'Intermediate', 'Final']).optional(),
  reason: z.string().optional(),
  halfDay: z.boolean().optional(),
});

router.post('/leaves', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role === 'Admin') {
      res.status(403).json({ error: 'Admins cannot apply for leave. Use Leave Management to sanction requests.' });
      return;
    }
    const body = leaveCreateSchema.parse(req.body);
    const span = leaveRequestDays(body.startDate.slice(0, 10), body.endDate.slice(0, 10), Boolean(body.halfDay));
    if ('error' in span) {
      res.status(400).json({ error: span.error });
      return;
    }
    const from = new Date(`${body.startDate.slice(0, 10)}T00:00:00.000Z`);
    const to = new Date(`${body.endDate.slice(0, 10)}T00:00:00.000Z`);

    if (body.type === 'Exam' && !body.examLevel) {
      res.status(400).json({ error: 'examLevel is required for Exam leave' });
      return;
    }

    // Serialize apply-per-user so concurrent clicks cannot insert duplicate rows
    const lockKey = `leave_apply_${req.user!.id}`.slice(0, 64);
    const lockRows = await prisma.$queryRaw<Array<{ got: number | bigint | null }>>`
      SELECT GET_LOCK(${lockKey}, 10) AS got
    `;
    if (!Number(lockRows[0]?.got)) {
      res.status(503).json({ error: 'Could not submit leave right now. Please try again.' });
      return;
    }

    try {
      // Block overlapping active leave (double-click / re-apply). Rejected can re-apply.
      const overlap = await prisma.leaveRequest.findFirst({
        where: {
          userId: req.user!.id,
          status: { in: ['Pending', 'Manager Approved', 'Approved'] },
          fromDate: { lte: to },
          toDate: { gte: from },
        },
        select: { id: true },
      });
      if (overlap) {
        res.status(409).json({ error: 'You already have a leave request covering these dates' });
        return;
      }

      const leave = await prisma.leaveRequest.create({
        data: {
          userId: req.user!.id,
          fromDate: from,
          toDate: to,
          days: span.days,
          halfDay: Boolean(body.halfDay),
          type: body.type,
          examLevel: body.examLevel,
          reason: body.reason,
        },
      });
      // Respond before email — awaiting notify made slow submits look stuck and caused multi-click duplicates
      void notifyLeaveSubmitted(req.user!.id, leave).catch((err: unknown) => {
        logger.error('Leave notification email failed', { error: (err as Error).message, leaveId: leave.id });
      });
      res.status(201).json(leave);
    } finally {
      await prisma.$executeRaw`SELECT RELEASE_LOCK(${lockKey})`;
    }
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

    const result = await applyLeaveDecision({
      leaveId: String(req.params.id),
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorFirmId: req.user!.firmId,
      actorEmail: req.user!.email,
      status: body.status,
      rejectionReason: body.rejectionReason,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const updated = await prisma.leaveRequest.findUnique({ where: { id: result.leave.id } });
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

    if (userId !== req.user!.id && !canViewFirmLeaves(req.user!.role)) {
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
    const attendanceDebit = await computeArticleAttendanceDebit(userId, {
      from: articleship.startDate,
      to: new Date(),
    });
    const firmCredit = articleship.firmLeaveCredit ?? ARTICLE_FIRM_LEAVE_DAYS;
    // Firm 24-day pot: approved Casual leave days + attendance policy debits
    const firmUsedFromLeaves = used.casual;
    const firmUsed = firmUsedFromLeaves + attendanceDebit.totalDebitDays;
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
      firmLeave: {
        credit: firmCredit,
        usedFromLeaves: firmUsedFromLeaves,
        attendanceDebitDays: attendanceDebit.totalDebitDays,
        softLateCount: attendanceDebit.softLateCount,
        hardLateCount: attendanceDebit.hardLateCount,
        noAttdCount: attendanceDebit.noAttdCount,
        used: firmUsed,
        remaining: firmCredit - firmUsed,
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
    if (!canViewFirmLeaves(req.user!.role)) {
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
