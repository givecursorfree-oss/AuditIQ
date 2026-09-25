import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { listLookupValues, LOOKUP_ACTIVITY, LOOKUP_CLIENT } from '../lib/hrLookups.js';

const router = Router();
router.use(authenticate);

const FALLBACK_WORK_TYPES = ['Audit', 'GST Filing', 'IT Filing', 'Consultation', 'Internal', 'Other'] as const;
const NON_BILLABLE_CATEGORIES = ['Internal Meeting', 'Office Admin', 'Exam Leave', 'Training', 'Sick Leave'] as const;

const timeEntrySchema = z.object({
  date: z.string(),
  hours: z.number().min(0.25).max(24),
  workType: z.string().min(1).max(120).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  isBillable: z.boolean().optional(),
  engagementId: z.string().uuid().optional(),
  clientName: z.string().trim().min(1).max(200),
  supervisorId: z.string().uuid(),
  compOff: z.boolean().optional(),
});

const timeEntryUpdateSchema = z.object({
  date: z.string().optional(),
  hours: z.number().min(0.25).max(24).optional(),
  workType: z.string().min(1).max(120).optional(),
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

const entryInclude = {
  engagement: { select: { title: true, client: { select: { name: true } } } },
  user: { select: { firstName: true, lastName: true, initials: true } },
  supervisor: { select: { id: true, firstName: true, lastName: true } },
} as const;

const SUPERVISOR_ROLES = ['Partner', 'Manager'] as const;

async function firmClientNames(firmId: string): Promise<string[]> {
  const [names, engagements] = await Promise.all([
    listLookupValues(firmId, LOOKUP_CLIENT),
    prisma.engagement.findMany({
      where: { firmId },
      select: { client: { select: { name: true } } },
    }),
  ]);
  const known = new Set(names.map((name) => name.trim().toLowerCase()));
  const all = [...names];
  for (const engagement of engagements) {
    const raw = engagement.client.name.trim();
    const key = raw.toLowerCase();
    if (raw && !known.has(key)) {
      known.add(key);
      all.push(raw);
    }
  }
  all.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return all;
}

// GET /api/time-entries?engagementId=xxx&userId=xxx|all
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const { engagementId, userId, from, to } = req.query;
    const where: Record<string, unknown> = engagementId
      ? { engagementId: String(engagementId), engagement: { firmId } }
      : { user: { firmId } };

    const isManagerPlus = ['Partner', 'Admin', 'Manager'].includes(req.user!.role);
    const requestedUserId = userId != null ? String(userId) : null;
    if (requestedUserId === 'all') {
      if (!isManagerPlus) {
        res.status(403).json({ error: 'Only managers can list all time entries' });
        return;
      }
    } else if (requestedUserId) {
      if (requestedUserId !== req.user!.id && !isManagerPlus) {
        res.status(403).json({ error: 'Cannot view another users time entries' });
        return;
      }
      where.userId = requestedUserId;
    } else if (!engagementId) {
      // Personal recent-logs view: always map to the signed-in user
      where.userId = req.user!.id;
    }
    // engagementId without userId → all entries on that engagement (EngagementTimeLog)

    if (from || to) {
      where.date = {};
      if (from) (where.date as Record<string, unknown>).gte = new Date(String(from));
      if (to) (where.date as Record<string, unknown>).lte = new Date(String(to));
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 500,
      include: entryInclude,
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
      if (!row.engagementId) continue;
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

// GET /api/time-entries/meta — work-type vocabularies for the UI (HR activity classification)
router.get('/meta/vocab', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user?.firmId;
    let workTypes: string[] = [...FALLBACK_WORK_TYPES];
    if (firmId) {
      const activities = await listLookupValues(firmId, LOOKUP_ACTIVITY);
      if (activities.length > 0) workTypes = activities;
    }
    res.json({ workTypes, nonBillableCategories: NON_BILLABLE_CATEGORIES });
  } catch (err) {
    logger.error('Time entry vocab error', { error: (err as Error).message });
    res.json({ workTypes: FALLBACK_WORK_TYPES, nonBillableCategories: NON_BILLABLE_CATEGORIES });
  }
});

/** GET /api/time-entries/meta/grid — full client list, engagements, manager/partner picker. */
router.get('/meta/grid', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;

    const [names, engagements, supervisors] = await Promise.all([
      listLookupValues(firmId, LOOKUP_CLIENT),
      prisma.engagement.findMany({
        where: { firmId },
        select: { id: true, title: true, client: { select: { name: true } } },
        orderBy: { title: 'asc' },
      }),
      prisma.user.findMany({
        where: { firmId, isActive: true, role: { in: [...SUPERVISOR_ROLES] } },
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: [{ role: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);

    const byClient = new Map<string, { id: string; title: string }[]>();
    const known = new Set(names.map((name) => name.trim().toLowerCase()));
    const clientNames = [...names];
    for (const engagement of engagements) {
      const raw = engagement.client.name.trim();
      const key = raw.toLowerCase();
      const list = byClient.get(key) || [];
      list.push({ id: engagement.id, title: engagement.title });
      byClient.set(key, list);
      if (raw && !known.has(key)) {
        known.add(key);
        clientNames.push(raw);
      }
    }
    clientNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    res.json({
      clients: clientNames.map((name) => ({
        name,
        engagements: byClient.get(name.trim().toLowerCase()) || [],
      })),
      supervisors: supervisors.map((person) => ({
        id: person.id,
        name: `${person.firstName} ${person.lastName}`.trim(),
        role: person.role,
      })),
    });
  } catch (err) {
    logger.error('Time entry grid meta error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load time grid' });
  }
});

// POST /api/time-entries
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const data = timeEntrySchema.parse(req.body);

    const allowedClients = await firmClientNames(firmId);
    const canonical = allowedClients.find(
      (name) => name.trim().toLowerCase() === data.clientName.trim().toLowerCase()
    );
    if (!canonical) {
      res.status(400).json({ error: 'Select a client from the firm list' });
      return;
    }

    const supervisor = await prisma.user.findFirst({
      where: { id: data.supervisorId, firmId, isActive: true, role: { in: [...SUPERVISOR_ROLES] } },
      select: { id: true },
    });
    if (!supervisor) {
      res.status(400).json({ error: 'Select a manager or partner' });
      return;
    }

    if (data.engagementId) {
      const engagement = await prisma.engagement.findFirst({
        where: { id: data.engagementId, firmId },
        select: { id: true, client: { select: { name: true } } },
      });
      if (!engagement) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }
      if (engagement.client.name.trim().toLowerCase() !== canonical.trim().toLowerCase()) {
        res.status(400).json({ error: 'Engagement does not belong to that client' });
        return;
      }
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
        clientName: canonical,
        supervisorId: supervisor.id,
        compOff: data.compOff ?? false,
        userId: req.user!.id,
        source: 'manual',
      },
      include: entryInclude,
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
      where: { id: String(req.params.id), user: { firmId } },
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
      include: entryInclude,
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
      where: { id: String(req.params.id), user: { firmId } },
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
