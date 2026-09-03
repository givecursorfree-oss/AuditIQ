import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { computeNextCreateAt } from '../lib/recurringScheduleHelpers.js';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  engagementTemplateId: z.string().min(1),
  clientId: z.string().min(1),
  isActive: z.boolean().default(true),
  frequency: z.enum(['monthly', 'quarterly', 'yearly']),
  triggerDay: z.number().int().min(1).max(31).optional(),
  triggerTime: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  triggerDates: z.array(z.string()).optional(),
  triggerMonth: z.string().optional(),
  autoCreateStartDate: z.string(),
  autoCreateEndDate: z.string().optional().nullable(),
  autoSendDataRequestLetter: z.boolean().default(true),
});

const patchSchema = createSchema.partial().extend({ isActive: z.boolean().optional() });

/** GET /api/recurring-schedules?clientId= */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const clientId = req.query.clientId ? String(req.query.clientId) : undefined;
    const where: Record<string, unknown> = {
      client: { firmId: req.user!.firmId! },
    };
    if (clientId) where.clientId = clientId;

    const rows = await prisma.recurringSchedule.findMany({
      where,
      include: { client: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(rows);
  } catch (err) {
    logger.error('List recurring schedules error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load schedules' });
  }
});

/** POST /api/recurring-schedules */
router.post('/', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = createSchema.parse(req.body);
    const client = await prisma.client.findFirst({
      where: { id: body.clientId, firmId: req.user!.firmId! },
    });
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const data = {
      engagementTemplateId: body.engagementTemplateId,
      clientId: body.clientId,
      isActive: body.isActive,
      frequency: body.frequency,
      triggerDay: body.triggerDay,
      triggerTime: body.triggerTime,
      triggerDates: body.triggerDates ? JSON.stringify(body.triggerDates) : null,
      triggerMonth: body.triggerMonth,
      autoCreateStartDate: new Date(body.autoCreateStartDate),
      autoCreateEndDate: body.autoCreateEndDate ? new Date(body.autoCreateEndDate) : null,
      autoSendDataRequestLetter: body.autoSendDataRequestLetter,
      createdById: req.user!.id,
    };

    const nextCreateAt = computeNextCreateAt({
      isActive: data.isActive,
      frequency: data.frequency,
      triggerDay: data.triggerDay ?? null,
      triggerDates: data.triggerDates,
      triggerMonth: data.triggerMonth ?? null,
      autoCreateStartDate: data.autoCreateStartDate,
      autoCreateEndDate: data.autoCreateEndDate,
    });
    const row = await prisma.recurringSchedule.upsert({
      where: {
        clientId_engagementTemplateId: {
          clientId: body.clientId,
          engagementTemplateId: body.engagementTemplateId,
        },
      },
      create: { ...data, nextCreateAt },
      update: { ...data, nextCreateAt, updatedAt: new Date() },
    });
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Create recurring schedule error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

/** PATCH /api/recurring-schedules/:id */
router.patch('/:id', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = patchSchema.parse(req.body);
    const existing = await prisma.recurringSchedule.findFirst({
      where: { id: String(req.params.id), client: { firmId: req.user!.firmId! } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }

    const merged = {
      ...existing,
      ...body,
      triggerTime: body.triggerTime ?? existing.triggerTime,
      triggerDates: body.triggerDates ? JSON.stringify(body.triggerDates) : existing.triggerDates,
      autoCreateStartDate: body.autoCreateStartDate ? new Date(body.autoCreateStartDate) : existing.autoCreateStartDate,
      autoCreateEndDate:
        body.autoCreateEndDate === null
          ? null
          : body.autoCreateEndDate
            ? new Date(body.autoCreateEndDate)
            : existing.autoCreateEndDate,
    };
    const nextCreateAt = computeNextCreateAt(merged);

    const updated = await prisma.recurringSchedule.update({
      where: { id: existing.id },
      data: {
        isActive: body.isActive,
        frequency: body.frequency,
        triggerDay: body.triggerDay,
        triggerTime: body.triggerTime,
        triggerDates: body.triggerDates ? JSON.stringify(body.triggerDates) : undefined,
        triggerMonth: body.triggerMonth,
        autoCreateStartDate: body.autoCreateStartDate ? new Date(body.autoCreateStartDate) : undefined,
        autoCreateEndDate:
          body.autoCreateEndDate === null
            ? null
            : body.autoCreateEndDate
              ? new Date(body.autoCreateEndDate)
              : undefined,
        autoSendDataRequestLetter: body.autoSendDataRequestLetter,
        nextCreateAt,
      },
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Update recurring schedule error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

export default router;
