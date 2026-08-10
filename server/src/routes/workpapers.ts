import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import {
  engagementIdsFilter,
  requireEngagementAccess,
  requireWorkpaperAccess,
} from '../lib/engagementAccess.js';
import * as diff from 'diff';

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

const querySchema = z.object({
  engagementId: z.string().uuid().optional(),
  section: z.string().optional(),
  status: z.string().optional(),
});

// GET /api/workpapers?engagementId=xxx
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = querySchema.parse(req.query);
    const engFilter = await engagementIdsFilter(
      req.user!.id,
      req.user!.role,
      req.user!.firmId
    );
    const where: Record<string, unknown> = { ...engFilter };
    if (query.engagementId) {
      if (!(await requireEngagementAccess(req, res, query.engagementId))) return;
      where.engagementId = query.engagementId;
    }
    if (query.section) where.section = query.section;
    if (query.status) where.status = query.status;

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
    logger.error('List workpapers error:', err);
    res.status(500).json({ error: 'Failed to fetch workpapers' });
  }
});

// GET /api/workpapers/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireWorkpaperAccess(req, res, String(req.params.id)))) return;
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
    logger.error('Get workpaper error:', err);
    res.status(500).json({ error: 'Failed to fetch workpaper' });
  }
});

// POST /api/workpapers
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = workpaperSchema.parse(req.body);
    if (!(await requireEngagementAccess(req, res, data.engagementId))) return;
    const workpaper = await prisma.workpaper.create({
      data: { ...data, preparedById: req.user!.id },
      include: { preparedBy: { select: { firstName: true, lastName: true, initials: true } } },
    });
    res.status(201).json(workpaper);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    logger.error('Create workpaper error:', err);
    res.status(500).json({ error: 'Failed to create workpaper' });
  }
});

// PUT /api/workpapers/:id
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireWorkpaperAccess(req, res, String(req.params.id)))) return;
    const data = workpaperSchema.partial().parse(req.body);
    const { engagementId, ...updateData } = data;
    if (engagementId && !(await requireEngagementAccess(req, res, engagementId))) return;

    const oldWorkpaper = await prisma.workpaper.findUnique({ where: { id: req.params.id } });
    if (!oldWorkpaper) { res.status(404).json({ error: 'Workpaper not found' }); return; }

    const workpaper = await prisma.workpaper.update({
      where: { id: req.params.id },
      data: updateData,
    });

    const patch = diff.createPatch('workpaper', JSON.stringify(oldWorkpaper, null, 2), JSON.stringify(workpaper, null, 2));
    
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPDATE',
        entity: 'Workpaper',
        entityId: req.params.id,
        details: JSON.stringify({ diff: patch, oldState: oldWorkpaper }),
        ipAddress: req.ip || req.connection.remoteAddress
      }
    });

    res.json(workpaper);
  } catch (err) {
    logger.error('Update workpaper error:', err);
    res.status(500).json({ error: 'Failed to update workpaper' });
  }
});

// POST /api/workpapers/:id/rollback
router.post('/:id/rollback', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireWorkpaperAccess(req, res, String(req.params.id)))) return;
    const { logId } = req.body;
    const log = await prisma.auditLog.findUnique({ where: { id: logId } });
    // The log row must be an UPDATE entry for this specific workpaper
    if (!log || log.action !== 'UPDATE' || log.entity !== 'Workpaper' || log.entityId !== req.params.id) {
      res.status(400).json({ error: 'Invalid rollback log' });
      return;
    }
    
    const details = JSON.parse(log.details || '{}');
    if (!details.oldState) { res.status(400).json({ error: 'No state to rollback to' }); return; }
    
    const { id, createdAt, updatedAt, engagementId, preparedById, ...rest } = details.oldState;
    const workpaper = await prisma.workpaper.update({
      where: { id: req.params.id },
      data: rest,
    });
    
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPDATE',
        entity: 'Workpaper',
        entityId: req.params.id,
        details: JSON.stringify({ reason: 'Rollback', rolledBackTo: logId }),
        ipAddress: req.ip || req.connection.remoteAddress
      }
    });
    
    res.json(workpaper);
  } catch (err) {
    logger.error('Rollback workpaper error:', err);
    res.status(500).json({ error: 'Failed to rollback workpaper' });
  }
});

// PATCH /api/workpapers/:id/status
const statusSchema = z.object({
  status: z.enum(['Draft', 'Prepared', 'Under Review', 'Reviewed', 'Approved', 'Needs Revision']),
});

router.patch('/:id/status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireWorkpaperAccess(req, res, String(req.params.id)))) return;
    const { status } = statusSchema.parse(req.body);
    const workpaper = await prisma.workpaper.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json(workpaper);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    logger.error('Update workpaper status error:', err);
    res.status(500).json({ error: 'Failed to update workpaper status' });
  }
});

// ─── Audit Steps ───

// POST /api/workpapers/:id/steps
router.post('/:id/steps', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireWorkpaperAccess(req, res, String(req.params.id)))) return;
    const { description, procedure } = req.body;
    const existing = await prisma.auditStep.count({ where: { workpaperId: req.params.id } });
    const step = await prisma.auditStep.create({
      data: { workpaperId: req.params.id, stepNumber: existing + 1, description, procedure },
    });
    res.status(201).json(step);
  } catch (err) {
    logger.error('Create audit step error:', err);
    res.status(500).json({ error: 'Failed to create audit step' });
  }
});

// PATCH /api/workpapers/steps/:stepId
router.patch('/steps/:stepId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.auditStep.findUnique({
      where: { id: req.params.stepId },
      select: { id: true, workpaperId: true },
    });
    if (!existing) { res.status(404).json({ error: 'Audit step not found' }); return; }
    if (!(await requireWorkpaperAccess(req, res, existing.workpaperId))) return;
    const { isCompleted, result, notes } = req.body;
    const step = await prisma.auditStep.update({
      where: { id: existing.id },
      data: { ...(isCompleted !== undefined && { isCompleted }), ...(result && { result }), ...(notes && { notes }) },
    });
    res.json(step);
  } catch (err) {
    logger.error('Update audit step error:', err);
    res.status(500).json({ error: 'Failed to update audit step' });
  }
});

// ─── Review Comments ───

// POST /api/workpapers/:id/comments
router.post('/:id/comments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireWorkpaperAccess(req, res, String(req.params.id)))) return;
    const { content, parentId } = req.body;
    const comment = await prisma.reviewComment.create({
      data: { workpaperId: req.params.id, authorId: req.user!.id, content, parentId },
      include: { author: { select: { firstName: true, lastName: true, initials: true, role: true } } },
    });
    res.status(201).json(comment);
  } catch (err) {
    logger.error('Create comment error:', err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// PATCH /api/workpapers/comments/:commentId/resolve
router.patch('/comments/:commentId/resolve', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.reviewComment.findUnique({
      where: { id: req.params.commentId },
      select: { id: true, workpaperId: true },
    });
    if (!existing) { res.status(404).json({ error: 'Comment not found' }); return; }
    if (!(await requireWorkpaperAccess(req, res, existing.workpaperId))) return;
    const comment = await prisma.reviewComment.update({
      where: { id: existing.id },
      data: { isResolved: true },
    });
    res.json(comment);
  } catch (err) {
    logger.error('Resolve comment error:', err);
    res.status(500).json({ error: 'Failed to resolve comment' });
  }
});

// ─── Sign-offs ───

// POST /api/workpapers/:id/signoff
router.post('/:id/signoff', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireWorkpaperAccess(req, res, String(req.params.id)))) return;
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
    logger.error('Signoff error:', err);
    res.status(500).json({ error: 'Failed to create sign-off' });
  }
});

export default router;
