import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { canAccessEngagement } from '../lib/engagementAccess.js';
import { getFingerprintLogoffTime } from '../lib/biometricService.js';

const router = Router();
router.use(authenticate);

const GST_IT_TYPES = new Set(['GST', 'Tax (44AB)']);

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function computeOvertimeHours(normalEnd: string, actualEnd: string): number {
  const diff = parseTimeToMinutes(actualEnd) - parseTimeToMinutes(normalEnd);
  return Math.max(0, Math.round((diff / 60) * 100) / 100);
}

async function getComputerLogoffTime(userId: string, date: Date): Promise<string | null> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const entry = await prisma.timeEntry.findFirst({
    where: { userId, date: { gte: start, lte: end }, endedAt: { not: null } },
    orderBy: { endedAt: 'desc' },
    select: { endedAt: true },
  });
  if (entry?.endedAt) {
    return entry.endedAt.toTimeString().slice(0, 5);
  }
  const att = await prisma.attendance.findFirst({
    where: { userId, date: start },
    select: { checkOut: true },
  });
  if (att?.checkOut) {
    return new Date(att.checkOut).toTimeString().slice(0, 5);
  }
  return null;
}

const lateHoursSchema = z.object({
  date: z.string(),
  normalEndTime: z.string().default('18:00'),
  actualEndTime: z.string(),
  reason: z.string().min(1),
  engagementId: z.string().optional(),
});

const deptVisitSchema = z.object({
  date: z.string(),
  department: z.enum(['GST_office', 'Income_Tax', 'TRACES', 'ROC', 'Other']),
  departmentDetails: z.string().min(1),
  purpose: z.string().min(1),
  engagementId: z.string().min(1),
  travelExpense: z.number().optional(),
  receiptUrl: z.string().optional(),
  departureTime: z.string(),
  returnTime: z.string(),
});

/** POST /api/claims/late-hours */
router.post('/late-hours', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = lateHoursSchema.parse(req.body);
    const claimDate = new Date(body.date);
    const [computerLogoffTime, fingerprintLogoffTime] = await Promise.all([
      getComputerLogoffTime(req.user!.id, claimDate),
      getFingerprintLogoffTime(req.user!.id, claimDate),
    ]);

    const claim = await prisma.lateHoursClaim.create({
      data: {
        staffId: req.user!.id,
        date: claimDate,
        normalEndTime: body.normalEndTime,
        actualEndTime: body.actualEndTime,
        computerLogoffTime,
        fingerprintLogoffTime,
        hoursOvertime: computeOvertimeHours(body.normalEndTime, body.actualEndTime),
        reason: body.reason,
        engagementId: body.engagementId,
      },
    });
    res.status(201).json(claim);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Late hours claim error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to submit claim' });
  }
});

/** POST /api/claims/dept-visit */
router.post('/dept-visit', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = deptVisitSchema.parse(req.body);
    const eng = await prisma.engagement.findFirst({
      where: { id: body.engagementId, firmId: req.user!.firmId! },
      select: { id: true, type: true, workflowDomain: true },
    });
    if (!eng) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    const isGstIt =
      GST_IT_TYPES.has(eng.type) || eng.workflowDomain === 'DT' || eng.workflowDomain === 'IDT';
    if (!isGstIt) {
      res.status(400).json({ error: 'Dept visit must be linked to a GST or Income Tax engagement' });
      return;
    }

    const allowed = await canAccessEngagement(
      req.user!.id,
      req.user!.role,
      req.user!.firmId,
      body.engagementId
    );
    if (!allowed) {
      res.status(403).json({ error: 'You are not assigned to this engagement' });
      return;
    }

    const claim = await prisma.deptVisitClaim.create({
      data: {
        staffId: req.user!.id,
        date: new Date(body.date),
        department: body.department,
        departmentDetails: body.departmentDetails,
        purpose: body.purpose,
        engagementId: body.engagementId,
        travelExpense: body.travelExpense,
        receiptUrl: body.receiptUrl,
        departureTime: body.departureTime,
        returnTime: body.returnTime,
      },
    });
    res.status(201).json(claim);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Dept visit claim error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to submit claim' });
  }
});

/** GET /api/claims/pending */
router.get('/pending', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId!;
    const subordinates = await prisma.user.findMany({
      where: { firmId, reportsToId: req.user!.id },
      select: { id: true },
    });
    const staffIds = [req.user!.id, ...subordinates.map((s) => s.id)];

    const [lateHours, deptVisits] = await Promise.all([
      prisma.lateHoursClaim.findMany({
        where: { status: 'pending', staff: { firmId } },
        include: {
          staff: { select: { id: true, firstName: true, lastName: true } },
          engagement: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.deptVisitClaim.findMany({
        where: { status: 'pending', staff: { firmId } },
        include: {
          staff: { select: { id: true, firstName: true, lastName: true } },
          engagement: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      lateHours,
      deptVisits,
      reviewerId: req.user!.id,
    });
  } catch (err) {
    logger.error('Pending claims error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load pending claims' });
  }
});

async function findFirmLateHoursClaim(req: AuthRequest, id: string) {
  return prisma.lateHoursClaim.findFirst({
    where: { id, staff: { firmId: req.user!.firmId! } },
  });
}

async function findFirmDeptVisitClaim(req: AuthRequest, id: string) {
  return prisma.deptVisitClaim.findFirst({
    where: { id, staff: { firmId: req.user!.firmId! } },
  });
}

/** PATCH /api/claims/late-hours/:id/approve */
router.patch(
  '/late-hours/:id/approve',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const notes = z.object({ managerNotes: z.string().optional() }).parse(req.body || {});
      const existing = await findFirmLateHoursClaim(req, String(req.params.id));
      if (!existing) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }
      const claim = await prisma.lateHoursClaim.update({
        where: { id: existing.id },
        data: {
          status: 'approved',
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
          managerNotes: notes.managerNotes,
        },
      });
      await prisma.notification.create({
        data: {
          userId: claim.staffId,
          title: 'Late hours claim approved',
          message: 'Your late hours claim has been approved.',
          type: 'success',
          link: '/claims/pending',
        },
      });
      res.json(claim);
    } catch (err) {
      res.status(500).json({ error: 'Failed to approve claim' });
    }
  }
);

router.patch(
  '/late-hours/:id/reject',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const notes = z.object({ managerNotes: z.string().min(1) }).parse(req.body);
      const existing = await findFirmLateHoursClaim(req, String(req.params.id));
      if (!existing) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }
      const claim = await prisma.lateHoursClaim.update({
        where: { id: existing.id },
        data: {
          status: 'rejected',
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
          managerNotes: notes.managerNotes,
        },
      });
      await prisma.notification.create({
        data: {
          userId: claim.staffId,
          title: 'Late hours claim rejected',
          message: notes.managerNotes,
          type: 'warning',
          link: '/claims/new/late-hours',
        },
      });
      res.json(claim);
    } catch (err) {
      res.status(500).json({ error: 'Failed to reject claim' });
    }
  }
);

router.patch(
  '/dept-visit/:id/approve',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const notes = z.object({ managerNotes: z.string().optional() }).parse(req.body || {});
      const existing = await findFirmDeptVisitClaim(req, String(req.params.id));
      if (!existing) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }
      const claim = await prisma.deptVisitClaim.update({
        where: { id: existing.id },
        data: {
          status: 'approved',
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
          managerNotes: notes.managerNotes,
        },
      });
      await prisma.notification.create({
        data: {
          userId: claim.staffId,
          title: 'Dept visit claim approved',
          message: 'Your department visit claim has been approved.',
          type: 'success',
          link: '/claims/pending',
        },
      });
      res.json(claim);
    } catch (err) {
      res.status(500).json({ error: 'Failed to approve claim' });
    }
  }
);

router.patch(
  '/dept-visit/:id/reject',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const notes = z.object({ managerNotes: z.string().min(1) }).parse(req.body);
      const existing = await findFirmDeptVisitClaim(req, String(req.params.id));
      if (!existing) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }
      const claim = await prisma.deptVisitClaim.update({
        where: { id: existing.id },
        data: {
          status: 'rejected',
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
          managerNotes: notes.managerNotes,
        },
      });
      await prisma.notification.create({
        data: {
          userId: claim.staffId,
          title: 'Dept visit claim rejected',
          message: notes.managerNotes,
          type: 'warning',
          link: '/claims/new/dept-visit',
        },
      });
      res.json(claim);
    } catch (err) {
      res.status(500).json({ error: 'Failed to reject claim' });
    }
  }
);

export default router;
