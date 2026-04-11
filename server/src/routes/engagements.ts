import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const engagementSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['Statutory', 'Tax (44AB)', 'GST', 'Internal', 'Special']),
  financialYear: z.string().min(1),
  clientId: z.string().uuid(),
  scope: z.string().optional(),
  startDate: z.string().optional(),
  deadline: z.string().optional(),
  billingType: z.enum(['Fixed', 'Hourly', 'Retainer']).optional(),
  billingAmount: z.number().optional(),
  notes: z.string().optional(),
  memberIds: z.array(z.string().uuid()).optional(),
});

// GET /api/engagements
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, type, search, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Record<string, unknown> = { firmId: req.user!.firmId! };
    if (status) where.status = String(status);
    if (type) where.type = String(type);
    if (search) {
      where.OR = [
        { title: { contains: String(search) } },
        { client: { name: { contains: String(search) } } },
      ];
    }

    const [engagements, total] = await Promise.all([
      prisma.engagement.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { updatedAt: 'desc' },
        include: {
          client: { select: { id: true, name: true, cin: true, turnover: true } },
          members: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, role: true } } } },
          _count: { select: { workpapers: true, documents: true, observations: true } },
        },
      }),
      prisma.engagement.count({ where }),
    ]);

    res.json({ engagements, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error('List engagements error:', err);
    res.status(500).json({ error: 'Failed to fetch engagements' });
  }
});

// GET /api/engagements/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engagement = await prisma.engagement.findFirst({
      where: { id: req.params.id, firmId: req.user!.firmId! },
      include: {
        client: true,
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, role: true, designation: true } } } },
        workpapers: { orderBy: { reference: 'asc' } },
        documents: { orderBy: { createdAt: 'desc' }, take: 20 },
        observations: { orderBy: { createdAt: 'desc' } },
        deadlines: { orderBy: { dueDate: 'asc' } },
        _count: { select: { workpapers: true, documents: true, observations: true, timeEntries: true } },
      },
    });
    if (!engagement) { res.status(404).json({ error: 'Engagement not found' }); return; }
    res.json(engagement);
  } catch (err) {
    console.error('Get engagement error:', err);
    res.status(500).json({ error: 'Failed to fetch engagement' });
  }
});

// POST /api/engagements
router.post('/', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = engagementSchema.parse(req.body);
    const { memberIds, startDate, deadline, ...rest } = data;

    const engagement = await prisma.engagement.create({
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : undefined,
        deadline: deadline ? new Date(deadline) : undefined,
        firmId: req.user!.firmId!,
        members: memberIds?.length ? {
          create: memberIds.map(userId => ({ userId, role: 'Preparer' })),
        } : undefined,
      },
      include: {
        client: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } } },
      },
    });

    res.status(201).json(engagement);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    console.error('Create engagement error:', err);
    res.status(500).json({ error: 'Failed to create engagement' });
  }
});

// PUT /api/engagements/:id
router.put('/:id', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = engagementSchema.partial().parse(req.body);
    const { memberIds, startDate, deadline, clientId, ...rest } = data;

    const updated = await prisma.engagement.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(deadline && { deadline: new Date(deadline) }),
      },
      include: { client: { select: { id: true, name: true } } },
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    console.error('Update engagement error:', err);
    res.status(500).json({ error: 'Failed to update engagement' });
  }
});

// PATCH /api/engagements/:id/status
router.patch('/:id/status', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, progress } = req.body;
    const updated = await prisma.engagement.update({
      where: { id: req.params.id },
      data: { ...(status && { status }), ...(progress !== undefined && { progress }) },
    });
    res.json(updated);
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

export default router;
