import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const workpaperSchema = z.object({
  reference: z.string().min(1),
  title: z.string().min(1),
  section: z.string().min(1),
  type: z.enum(['Standard', 'CARO', 'SA', 'GST', 'TDS', 'Lead Schedule']).optional(),
  content: z.string().optional(),
  engagementId: z.string().uuid(),
});

// GET /api/workpapers?engagementId=xxx
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, section, status } = req.query;
    const where: Record<string, unknown> = {};
    if (engagementId) where.engagementId = String(engagementId);
    if (section) where.section = String(section);
    if (status) where.status = String(status);

    const workpapers = await prisma.workpaper.findMany({
      where,
      orderBy: { reference: 'asc' },
      include: {
        preparedBy: { select: { id: true, firstName: true, lastName: true, initials: true } },
        auditSteps: { orderBy: { stepNumber: 'asc' } },
        reviewComments: { orderBy: { createdAt: 'desc' }, take: 5, include: { author: { select: { firstName: true, lastName: true, initials: true } } } },
        signoffs: { include: { user: { select: { firstName: true, lastName: true, initials: true, role: true } } } },
        _count: { select: { documents: true, reviewComments: true } },
      },
    });

    res.json(workpapers);
  } catch (err) {
    console.error('List workpapers error:', err);
    res.status(500).json({ error: 'Failed to fetch workpapers' });
  }
});

// GET /api/workpapers/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workpaper = await prisma.workpaper.findUnique({
      where: { id: req.params.id },
      include: {
        preparedBy: { select: { id: true, firstName: true, lastName: true, initials: true, role: true } },
        auditSteps: { orderBy: { stepNumber: 'asc' } },
        reviewComments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, firstName: true, lastName: true, initials: true, role: true } } },
        },
        signoffs: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, role: true } } } },
        documents: { orderBy: { createdAt: 'desc' } },
        engagement: { select: { id: true, title: true, client: { select: { name: true } } } },
      },
    });
    if (!workpaper) { res.status(404).json({ error: 'Workpaper not found' }); return; }
    res.json(workpaper);
  } catch (err) {
    console.error('Get workpaper error:', err);
    res.status(500).json({ error: 'Failed to fetch workpaper' });
  }
});

// POST /api/workpapers
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = workpaperSchema.parse(req.body);
    const workpaper = await prisma.workpaper.create({
      data: { ...data, preparedById: req.user!.id },
      include: { preparedBy: { select: { firstName: true, lastName: true, initials: true } } },
    });
    res.status(201).json(workpaper);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    console.error('Create workpaper error:', err);
    res.status(500).json({ error: 'Failed to create workpaper' });
  }
});

// PUT /api/workpapers/:id
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = workpaperSchema.partial().parse(req.body);
    const { engagementId, ...updateData } = data;
    const workpaper = await prisma.workpaper.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json(workpaper);
  } catch (err) {
    console.error('Update workpaper error:', err);
    res.status(500).json({ error: 'Failed to update workpaper' });
  }
});

// PATCH /api/workpapers/:id/status
router.patch('/:id/status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.body;
    const workpaper = await prisma.workpaper.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json(workpaper);
  } catch (err) {
    console.error('Update workpaper status error:', err);
    res.status(500).json({ error: 'Failed to update workpaper status' });
  }
});

// ─── Audit Steps ───

// POST /api/workpapers/:id/steps
router.post('/:id/steps', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { description, procedure } = req.body;
    const existing = await prisma.auditStep.count({ where: { workpaperId: req.params.id } });
    const step = await prisma.auditStep.create({
      data: { workpaperId: req.params.id, stepNumber: existing + 1, description, procedure },
    });
    res.status(201).json(step);
  } catch (err) {
    console.error('Create audit step error:', err);
    res.status(500).json({ error: 'Failed to create audit step' });
  }
});

// PATCH /api/workpapers/steps/:stepId
router.patch('/steps/:stepId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { isCompleted, result, notes } = req.body;
    const step = await prisma.auditStep.update({
      where: { id: req.params.stepId },
      data: { ...(isCompleted !== undefined && { isCompleted }), ...(result && { result }), ...(notes && { notes }) },
    });
    res.json(step);
  } catch (err) {
    console.error('Update audit step error:', err);
    res.status(500).json({ error: 'Failed to update audit step' });
  }
});

// ─── Review Comments ───

// POST /api/workpapers/:id/comments
router.post('/:id/comments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { content, parentId } = req.body;
    const comment = await prisma.reviewComment.create({
      data: { workpaperId: req.params.id, authorId: req.user!.id, content, parentId },
      include: { author: { select: { firstName: true, lastName: true, initials: true, role: true } } },
    });
    res.status(201).json(comment);
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// PATCH /api/workpapers/comments/:commentId/resolve
router.patch('/comments/:commentId/resolve', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const comment = await prisma.reviewComment.update({
      where: { id: req.params.commentId },
      data: { isResolved: true },
    });
    res.json(comment);
  } catch (err) {
    console.error('Resolve comment error:', err);
    res.status(500).json({ error: 'Failed to resolve comment' });
  }
});

// ─── Sign-offs ───

// POST /api/workpapers/:id/signoff
router.post('/:id/signoff', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, status, comments } = req.body;
    const signoff = await prisma.signOff.create({
      data: {
        workpaperId: req.params.id,
        userId: req.user!.id,
        type: type || req.user!.role,
        status: status || 'Approved',
        comments,
        signedAt: status === 'Approved' ? new Date() : undefined,
      },
      include: { user: { select: { firstName: true, lastName: true, initials: true, role: true } } },
    });
    res.status(201).json(signoff);
  } catch (err) {
    console.error('Signoff error:', err);
    res.status(500).json({ error: 'Failed to create sign-off' });
  }
});

export default router;
