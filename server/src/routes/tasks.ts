import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { io } from '../index.js';
import logger from '../lib/logger.js';
import { requireEngagementAccess } from '../lib/engagementAccess.js';
import { getEngagementStaffIds } from '../lib/engagementTeam.js';
import {
  enrichTask,
  isTaskCompleted,
  normalizeTaskStatus,
  TASK_STATUSES,
} from '../lib/taskHelpers.js';

const router = Router();
router.use(authenticate);

const MANAGER_ROLES = ['Partner', 'Admin', 'Manager'];

function isManager(role: string): boolean {
  return MANAGER_ROLES.includes(role);
}

function emitTaskCompleted(
  existing: {
    engagementId: string | null;
    id: string;
    title: string;
    createdById: string | null;
    assignee: { firstName: string; lastName: string };
  },
  completedById: string
) {
  if (!existing.engagementId) return;
  io.to(`engagement:${existing.engagementId}`).emit('task-completed', {
    engagementId: existing.engagementId,
    taskId: existing.id,
    title: existing.title,
    completedById,
    completedByName: `${existing.assignee.firstName} ${existing.assignee.lastName}`.trim(),
    createdById: existing.createdById,
  });
}

async function notifyTaskAssigner(
  task: {
    id: string;
    title: string;
    createdById: string;
    engagementId: string | null;
    assigneeId: string;
  },
  actorId: string,
  assigneeName: string,
  event: 'started' | 'completed'
): Promise<void> {
  if (task.createdById === actorId || task.createdById === task.assigneeId) return;
  const link = task.engagementId
    ? `/engagements/${task.engagementId}?tab=documents&taskId=${task.id}`
    : '/time-tracker';
  await prisma.notification.create({
    data: {
      userId: task.createdById,
      title: event === 'completed' ? 'Task completed' : 'Task in progress',
      message:
        event === 'completed'
          ? `${assigneeName} completed “${task.title}”.`
          : `${assigneeName} started “${task.title}”.`,
      type: 'info',
      link,
    },
  });
}

async function notifyAssignerOnStatusChange(
  existing: {
    id: string;
    title: string;
    status: string;
    createdById: string;
    engagementId: string | null;
    assigneeId: string;
    assignee: { firstName: string; lastName: string };
  },
  actorId: string,
  nextStatus: string
): Promise<void> {
  const prev = normalizeTaskStatus(existing.status);
  const next = normalizeTaskStatus(nextStatus);
  const name = `${existing.assignee.firstName} ${existing.assignee.lastName}`.trim();
  if (prev === 'not_started' && next === 'in_progress') {
    await notifyTaskAssigner(existing, actorId, name, 'started');
  }
  if (!isTaskCompleted(prev) && isTaskCompleted(next)) {
    await notifyTaskAssigner(existing, actorId, name, 'completed');
  }
}

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(['Low', 'Normal', 'High', 'Urgent']).default('Normal'),
  dueDate: z.string().optional(),
  proposedTimeline: z.string().optional(),
  estimatedHours: z.number().optional(),
  notes: z.string().optional(),
  assigneeId: z.string().min(1),
  engagementId: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(['Low', 'Normal', 'High', 'Urgent']).optional(),
  status: z.enum([...TASK_STATUSES, 'Open', 'In Progress', 'Done', 'Cancelled']).optional(),
  dueDate: z.string().optional().nullable(),
  proposedTimeline: z.string().optional().nullable(),
  estimatedHours: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  assigneeId: z.string().optional(),
});

const statusOnlySchema = z.object({
  status: z.enum([...TASK_STATUSES, 'Open', 'In Progress', 'Done']),
  notes: z.string().optional(),
});

/** GET /api/tasks — my tasks, team scope, or engagement filter */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = String(req.query.scope || 'mine');
    const status = req.query.status ? String(req.query.status) : undefined;
    const engagementId = req.query.engagementId ? String(req.query.engagementId) : undefined;

    const where: Record<string, unknown> = {};

    if (engagementId) {
      if (!(await requireEngagementAccess(req, res, engagementId))) return;
      where.engagementId = engagementId;
    } else if (scope === 'mine') {
      where.assigneeId = req.user!.id;
    } else if (scope === 'team') {
      if (!isManager(req.user!.role)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      where.assignee = { firmId: req.user!.firmId! };
    }

    if (status) where.status = status;

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, initials: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        engagement: { select: { id: true, title: true, client: { select: { name: true } } } },
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(tasks.map(enrichTask));
  } catch (err) {
    logger.error('List tasks error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

/** POST /api/tasks */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = createSchema.parse(req.body);
    if (!req.user!.firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }

    if (body.engagementId && !(await requireEngagementAccess(req, res, body.engagementId))) return;

    if (body.assigneeId !== req.user!.id && !isManager(req.user!.role)) {
      res.status(403).json({ error: 'Only managers can assign tasks to others' });
      return;
    }

    if (body.engagementId) {
      const staffIds = await getEngagementStaffIds(body.engagementId);
      if (staffIds.length > 0 && !staffIds.includes(body.assigneeId)) {
        res.status(400).json({ error: 'Assignee must be on the engagement team staff list' });
        return;
      }
    }

    const assignee = await prisma.user.findFirst({
      where: { id: body.assigneeId, firmId: req.user!.firmId },
      select: { id: true },
    });
    if (!assignee) {
      res.status(404).json({ error: 'Assignee not found in your firm' });
      return;
    }

    const dueDate = body.dueDate ? new Date(body.dueDate) : null;
    const task = await prisma.task.create({
      data: {
        title: body.title,
        description: body.description,
        priority: body.priority,
        dueDate: dueDate || undefined,
        proposedTimeline: body.proposedTimeline,
        estimatedHours: body.estimatedHours,
        notes: body.notes,
        assigneeId: body.assigneeId,
        createdById: req.user!.id,
        engagementId: body.engagementId,
        status: 'not_started',
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        engagement: { select: { id: true, title: true } },
      },
    });

    // Assigning a task should reflect the person on the engagement team.
    if (body.engagementId) {
      await prisma.engagementMember.upsert({
        where: { engagementId_userId: { engagementId: body.engagementId, userId: task.assigneeId } },
        update: {},
        create: {
          engagementId: body.engagementId,
          userId: task.assigneeId,
          teamRole: 'Staff',
          role: 'Preparer',
        },
      });
    }

    if (task.assigneeId !== req.user!.id) {
      const link = body.engagementId
        ? `/engagements/${body.engagementId}?tab=workflow&taskId=${task.id}`
        : `/time-tracker?taskId=${task.id}`;
      await prisma.notification.create({
        data: {
          userId: task.assigneeId,
          title: 'New task assigned',
          message: task.title,
          type: 'info',
          link,
        },
      });
    }
    res.status(201).json(enrichTask(task));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Create task error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/** PATCH /api/tasks/:id/status — staff status + notes */
router.patch('/:id/status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = statusOnlySchema.parse(req.body);
    const existing = await prisma.task.findFirst({
      where: { id: String(req.params.id), assigneeId: req.user!.id },
      include: { assignee: { select: { firstName: true, lastName: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const status = normalizeTaskStatus(body.status);
    const prevStatus = normalizeTaskStatus(existing.status);
    const data: Record<string, unknown> = {
      status,
      notes: body.notes ?? existing.notes,
    };
    if (status === 'completed' && !isTaskCompleted(existing.status)) {
      data.completedAt = new Date();
    }
    const updated = await prisma.task.update({ where: { id: existing.id }, data });
    await notifyAssignerOnStatusChange(existing, req.user!.id, status);
    if (status === 'completed' && !isTaskCompleted(prevStatus) && existing.engagementId) {
      emitTaskCompleted(existing, req.user!.id);
    }
    res.json(enrichTask(updated));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Update task status error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

/** PATCH /api/tasks/:id */
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = updateSchema.parse(req.body);
    const existing = await prisma.task.findFirst({
      where: {
        id: String(req.params.id),
        OR: [
          { assigneeId: req.user!.id },
          { createdById: req.user!.id },
          ...(isManager(req.user!.role) ? [{ assignee: { firmId: req.user!.firmId! } }] : []),
        ],
      },
      include: { assignee: { select: { firstName: true, lastName: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const staffOnly = !isManager(req.user!.role) && existing.assigneeId === req.user!.id;
    if (staffOnly) {
      const allowed = statusOnlySchema.safeParse(req.body);
      if (!allowed.success) {
        res.status(403).json({ error: 'Staff can only update status and notes' });
        return;
      }
    }

    const data: Record<string, unknown> = { ...body };
    if (body.status) data.status = normalizeTaskStatus(body.status);
    if (body.dueDate === null) data.dueDate = null;
    else if (body.dueDate) data.dueDate = new Date(body.dueDate);
    if (body.status && isTaskCompleted(normalizeTaskStatus(body.status)) && !isTaskCompleted(existing.status)) {
      data.completedAt = new Date();
    }

    const updated = await prisma.task.update({ where: { id: existing.id }, data });

    // Reassigning a task adds the new assignee to the engagement team.
    if (body.assigneeId && body.assigneeId !== existing.assigneeId && existing.engagementId) {
      await prisma.engagementMember.upsert({
        where: { engagementId_userId: { engagementId: existing.engagementId, userId: body.assigneeId } },
        update: {},
        create: {
          engagementId: existing.engagementId,
          userId: body.assigneeId,
          teamRole: 'Staff',
          role: 'Preparer',
        },
      });
    }

    if (body.status) {
      await notifyAssignerOnStatusChange(existing, req.user!.id, normalizeTaskStatus(body.status));
    }

    if (body.status && isTaskCompleted(normalizeTaskStatus(body.status)) && existing.engagementId) {
      const wasCompleted = isTaskCompleted(existing.status);
      if (!wasCompleted) {
        emitTaskCompleted(existing, req.user!.id);
      }
    }

    res.json(enrichTask(updated));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Update task error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/** DELETE /api/tasks/:id */
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.task.findFirst({
      where: {
        id: String(req.params.id),
        ...(isManager(req.user!.role)
          ? { assignee: { firmId: req.user!.firmId! } }
          : { createdById: req.user!.id }),
      },
    });
    if (!existing) {
      res.status(404).json({ error: 'Task not found or not yours to delete' });
      return;
    }
    await prisma.task.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete task error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
