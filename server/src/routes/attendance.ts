import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { authenticate, AuthRequest, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/attendance — list attendance records
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, date, month } = req.query;
    const where: Record<string, unknown> = { userId: req.user!.id };

    // Partners/Managers see all firm attendance
    if (['Partner', 'Manager'].includes(req.user!.role)) {
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
    res.json(records);
  } catch (err) {
    console.error('List attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// POST /api/attendance/check-in
router.post('/check-in', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { method, latitude, longitude, officeId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already checked in today
    const existing = await prisma.attendance.findFirst({
      where: { userId: req.user!.id, date: today },
    });
    if (existing) {
      res.status(400).json({ error: 'Already checked in today' });
      return;
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId: req.user!.id,
        date: today,
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
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

// POST /api/attendance/check-out
router.post('/check-out', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findFirst({
      where: { userId: req.user!.id, date: today },
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
    console.error('Check-out error:', err);
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
    console.error('Attendance summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ─── Leave Requests ───

// GET /api/attendance/leaves
router.get('/leaves', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const where: Record<string, unknown> = {};
    if (!['Partner', 'Manager'].includes(req.user!.role)) {
      where.userId = req.user!.id;
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
    console.error('List leaves error:', err);
    res.status(500).json({ error: 'Failed to fetch leaves' });
  }
});

// POST /api/attendance/leaves
router.post('/leaves', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, type, reason } = req.body;
    const from = new Date(startDate);
    const to = new Date(endDate);
    const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const leave = await prisma.leaveRequest.create({
      data: {
        userId: req.user!.id,
        fromDate: from,
        toDate: to,
        days,
        type: type || 'Casual',
        reason,
      },
    });
    res.status(201).json(leave);
  } catch (err) {
    console.error('Create leave error:', err);
    res.status(500).json({ error: 'Failed to create leave request' });
  }
});

// PATCH /api/attendance/leaves/:id
router.patch('/leaves/:id', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.body;
    const leave = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: {
        status,
        approverId: req.user!.id,
      },
    });
    res.json(leave);
  } catch (err) {
    console.error('Update leave error:', err);
    res.status(500).json({ error: 'Failed to update leave request' });
  }
});

export default router;
