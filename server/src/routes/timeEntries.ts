import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const WORK_TYPES = ['Audit', 'GST Filing', 'IT Filing', 'Consultation', 'Internal', 'Other'] as const;
const NON_BILLABLE_CATEGORIES = ['Internal Meeting', 'Office Admin', 'Exam Leave', 'Training', 'Sick Leave'] as const;

const timeEntrySchema = z.object({
  date: z.string(),
  hours: z.number().min(0.25).max(24),
  workType: z.enum(WORK_TYPES).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  isBillable: z.boolean().optional(),
  engagementId: z.string().uuid(),
});

const timeEntryUpdateSchema = z.object({
  date: z.string().optional(),
  hours: z.number().min(0.25).max(24).optional(),
  workType: z.enum(WORK_TYPES).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  isBillable: z.boolean().optional(),
});

function requireFirmId(req: AuthRequest, res: Response): string | null {
  const firmId = req.user!.firmId;
  if (!firmId) {
    res.status(400).json({ error: 'Your account is not linked to a firm' });
    return null;
  }
  return firmId;
}

// GET /api/time-entries?engagementId=xxx&userId=xxx
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const { engagementId, userId, from, to } = req.query;
    const where: Record<string, unknown> = { engagement: { firmId } };
    if (engagementId) where.engagementId = String(engagementId);
    if (userId) where.userId = String(userId);
    if (from || to) {
      where.date = {};
      if (from) (where.date as Record<string, unknown>).gte = new Date(String(from));
      if (to) (where.date as Record<string, unknown>).lte = new Date(String(to));
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        engagement: { select: { title: true, client: { select: { name: true } } } },
        user: { select: { firstName: true, lastName: true, initials: true } },
      },
    });
    res.json(entries);
  } catch (err) {
    logger.error('List time entries error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// GET /api/time-entries/summary — billing summary
router.get('/summary', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const { engagementId, userId, from, to } = req.query;
    const where: Record<string, unknown> = { engagement: { firmId } };
    if (engagementId) where.engagementId = String(engagementId);
    if (userId) where.userId = String(userId);
    if (from || to) {
      where.date = {};
      if (from) (where.date as Record<string, unknown>).gte = new Date(String(from));
      if (to) (where.date as Record<string, unknown>).lte = new Date(String(to));
    }

    // Aggregate in MySQL — avoid loading every row under concurrent report views.
    const [byBillable, byEngagementRows, byUserRows] = await Promise.all([
      prisma.timeEntry.groupBy({ by: ['isBillable'], where, _sum: { hours: true }, _count: true }),
      prisma.timeEntry.groupBy({ by: ['engagementId'], where, _sum: { hours: true } }),
      prisma.timeEntry.groupBy({ by: ['userId'], where, _sum: { hours: true } }),
    ]);

    let totalHours = 0;
    let billableHours = 0;
    let entryCount = 0;
    for (const row of byBillable) {
      const hours = row._sum.hours ?? 0;
      totalHours += hours;
      entryCount += row._count;
      if (row.isBillable) billableHours = hours;
    }
    const nonBillableHours = totalHours - billableHours;

    const byEngagement: Record<string, number> = {};
    for (const row of byEngagementRows) {
      byEngagement[row.engagementId] = row._sum.hours ?? 0;
    }
    const byUser: Record<string, number> = {};
    for (const row of byUserRows) {
      byUser[row.userId] = row._sum.hours ?? 0;
    }

    res.json({ totalHours, billableHours, nonBillableHours, entryCount, byEngagement, byUser });
  } catch (err) {
    logger.error('Time entries summary error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /api/time-entries/meta — work-type vocabularies for the UI
router.get('/meta/vocab', (_req, res) => {
  res.json({ workTypes: WORK_TYPES, nonBillableCategories: NON_BILLABLE_CATEGORIES });
});

// POST /api/time-entries
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const data = timeEntrySchema.parse(req.body);

    const engagement = await prisma.engagement.findFirst({
      where: { id: data.engagementId, firmId },
      select: { id: true },
    });
    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    const entry = await prisma.timeEntry.create({
      data: {
        date: new Date(data.date),
        hours: data.hours,
        workType: data.workType,
        description: data.description,
        notes: data.notes,
        isBillable: data.isBillable ?? data.workType !== 'Internal',
        engagementId: data.engagementId,
        userId: req.user!.id,
        source: 'manual',
      },
      include: {
        engagement: { select: { title: true, client: { select: { name: true } } } },
        user: { select: { firstName: true, lastName: true, initials: true } },
      },
    });
    res.status(201).json(entry);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    logger.error('Create time entry error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create time entry' });
  }
});

// PATCH /api/time-entries/:id
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const { date, hours, workType, description, notes, isBillable } = timeEntryUpdateSchema.parse(req.body);

    const existing = await prisma.timeEntry.findFirst({
      where: { id: String(req.params.id), engagement: { firmId } },
      select: { id: true, userId: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Time entry not found' });
      return;
    }
    if (existing.userId !== req.user!.id && !['Partner', 'Admin', 'Manager'].includes(req.user!.role)) {
      res.status(403).json({ error: 'You can only edit your own time entries' });
      return;
    }

    const entry = await prisma.timeEntry.update({
      where: { id: existing.id },
      data: {
        ...(date && { date: new Date(date) }),
        ...(hours !== undefined && { hours }),
        ...(workType !== undefined && { workType }),
        ...(description !== undefined && { description }),
        ...(notes !== undefined && { notes }),
        ...(isBillable !== undefined && { isBillable }),
      },
      include: {
        engagement: { select: { title: true, client: { select: { name: true } } } },
        user: { select: { firstName: true, lastName: true, initials: true } },
      },
    });
    res.json(entry);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    logger.error('Update time entry error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// DELETE /api/time-entries/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;

    const existing = await prisma.timeEntry.findFirst({
      where: { id: String(req.params.id), engagement: { firmId } },
      select: { id: true, userId: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Time entry not found' });
      return;
    }
    if (existing.userId !== req.user!.id && !['Partner', 'Admin'].includes(req.user!.role)) {
      res.status(403).json({ error: 'You can only delete your own time entries' });
      return;
    }

    await prisma.timeEntry.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error('Delete time entry error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

export default router;
