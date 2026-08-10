import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.js';
import { canViewApprovalRequest } from '../lib/approvalAccess.js';
import {
  isDesignatedApprover,
  isPendingApproverForUser,
  validateWorkflowSteps,
} from '../lib/approvalWorkflow.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

/** Firm guard: user must be linked to a firm for tenant-scoped operations. */
function requireFirm(req: AuthRequest, res: Response): boolean {
  if (!req.user!.firmId) {
    res.status(400).json({ error: 'Your account is not linked to a firm' });
    return false;
  }
  return true;
}

async function validateApproverUsersInFirm(
  firmId: string,
  steps: { approverUserId?: string | null }[]
): Promise<string | null> {
  const userIds = steps.map((s) => s.approverUserId).filter((id): id is string => Boolean(id));
  if (!userIds.length) return null;
  const count = await prisma.user.count({
    where: { id: { in: userIds }, firmId },
  });
  if (count !== userIds.length) {
    return 'One or more approver users do not belong to your firm';
  }
  return null;
}

// ─── Workflow Templates ───

const workflowSchema = z.object({
  name: z.string().min(1),
  entityType: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(z.object({
    stepOrder: z.number().int().min(1),
    approverRole: z.string().optional(),
    approverUserId: z.string().uuid().optional(),
    autoEscalateDays: z.number().int().optional(),
  })).min(1),
});

// GET /api/approvals/workflows — list all workflows for the firm
router.get('/workflows', requirePermission('approvals', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireFirm(req, res)) return;
    const workflows = await prisma.approvalWorkflow.findMany({
      where: { firmId: req.user!.firmId! },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        _count: { select: { requests: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(workflows);
  } catch (err) {
    logger.error('Failed to list workflows', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list workflows' });
  }
});

// POST /api/approvals/workflows — create workflow template
router.post('/workflows', requirePermission('approvals', 'edit'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireFirm(req, res)) return;
    const data = workflowSchema.parse(req.body);

    const stepError = validateWorkflowSteps(data.steps);
    if (stepError) {
      res.status(400).json({ error: stepError });
      return;
    }

    const approverError = await validateApproverUsersInFirm(req.user!.firmId!, data.steps);
    if (approverError) {
      res.status(400).json({ error: approverError });
      return;
    }

    const workflow = await prisma.approvalWorkflow.create({
      data: {
        name: data.name,
        entityType: data.entityType,
        description: data.description,
        firmId: req.user!.firmId!,
        steps: {
          create: data.steps.map(s => ({
            stepOrder: s.stepOrder,
            approverRole: s.approverRole,
            approverUserId: s.approverUserId,
            autoEscalateDays: s.autoEscalateDays,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    res.status(201).json(workflow);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to create workflow', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// DELETE /api/approvals/workflows/:id
router.delete('/workflows/:id', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireFirm(req, res)) return;
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: { id: req.params.id, firmId: req.user!.firmId! },
      select: { id: true },
    });
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    await prisma.approvalWorkflow.delete({ where: { id: workflow.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete workflow', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

// ─── Approval Requests ───

const requestSchema = z.object({
  workflowId: z.string().uuid(),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(['Low', 'Normal', 'High', 'Urgent']).default('Normal'),
});

const requestInclude = {
  requester: { select: { firstName: true, lastName: true, initials: true } },
  workflow: {
    select: {
      name: true,
      entityType: true,
      steps: { orderBy: { stepOrder: 'asc' as const } },
    },
  },
  steps: {
    orderBy: { stepOrder: 'asc' as const },
    include: { approver: { select: { firstName: true, lastName: true, initials: true } } },
  },
};

// GET /api/approvals/requests — requests relevant to the current user
router.get('/requests', requirePermission('approvals', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireFirm(req, res)) return;
    const { role, id: userId } = req.user!;
    const { status, type } = req.query;

    const where: Record<string, unknown> = {
      workflow: { firmId: req.user!.firmId! },
    };
    if (status) where.status = String(status);
    if (type) where.entityType = String(type);

    let requests = await prisma.approvalRequest.findMany({
      where,
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });

    if (!['Partner', 'Admin'].includes(role)) {
      requests = requests.filter((r) =>
        canViewApprovalRequest(role, userId, {
          requesterId: r.requesterId,
          approverIds: r.steps.map((s) => s.approverId),
          currentStep: r.currentStep,
          status: r.status,
          steps: r.steps,
          workflowSteps: r.workflow.steps,
        })
      );
    }

    res.json(requests);
  } catch (err) {
    logger.error('Failed to list approval requests', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list requests' });
  }
});

// POST /api/approvals/requests — submit a new approval request
router.post('/requests', requirePermission('approvals', 'create'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireFirm(req, res)) return;
    const data = requestSchema.parse(req.body);

    const workflow = await prisma.approvalWorkflow.findFirst({
      where: { id: data.workflowId, firmId: req.user!.firmId! },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    const stepError = validateWorkflowSteps(workflow.steps);
    if (stepError) {
      res.status(400).json({ error: `Workflow misconfigured: ${stepError}` });
      return;
    }

    const request = await prisma.approvalRequest.create({
      data: {
        workflowId: data.workflowId,
        entityType: data.entityType,
        entityId: data.entityId,
        title: data.title,
        description: data.description,
        priority: data.priority,
        requesterId: req.user!.id,
        status: 'In Progress',
        currentStep: 1,
        steps: {
          create: workflow.steps.map(ws => ({
            stepOrder: ws.stepOrder,
            approverId: ws.approverUserId || null,
            status: 'Pending',
          })),
        },
      },
      include: {
        requester: { select: { firstName: true, lastName: true, initials: true } },
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: { approver: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    res.status(201).json(request);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to create approval request', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// ─── Approve / Reject a step ───

const actionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  comments: z.string().optional(),
});

// POST /api/approvals/requests/:id/action
router.post('/requests/:id/action', requirePermission('approvals', 'approve'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireFirm(req, res)) return;
    const { id } = req.params;
    const { action, comments } = actionSchema.parse(req.body);
    const userId = req.user!.id;

    const request = await prisma.approvalRequest.findFirst({
      where: { id, workflow: { firmId: req.user!.firmId! } },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      },
    });

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    const currentStep = request.steps.find(
      s => s.stepOrder === request.currentStep && s.status === 'Pending'
    );

    if (!currentStep) {
      res.status(400).json({ error: 'No pending step to act on' });
      return;
    }

    if (!['Partner', 'Admin'].includes(req.user!.role)) {
      const workflowStep = request.workflow.steps.find(s => s.stepOrder === request.currentStep);
      const designatedUserId = currentStep.approverId ?? workflowStep?.approverUserId;
      const designatedRole = workflowStep?.approverRole;
      if (!isDesignatedApprover(userId, req.user!.role, designatedUserId, designatedRole)) {
        res.status(403).json({ error: 'You are not the designated approver for this step' });
        return;
      }
    }

    await prisma.approvalStep.update({
      where: { id: currentStep.id },
      data: {
        status: action === 'APPROVE' ? 'Approved' : 'Rejected',
        comments,
        actionAt: new Date(),
        approverId: userId,
      },
    });

    if (action === 'REJECT') {
      await prisma.approvalRequest.update({
        where: { id },
        data: { status: 'Rejected' },
      });
    } else {
      const nextStep = request.steps.find(s => s.stepOrder === request.currentStep + 1);
      if (nextStep) {
        await prisma.approvalRequest.update({
          where: { id },
          data: { currentStep: request.currentStep + 1 },
        });
      } else {
        await prisma.approvalRequest.update({
          where: { id },
          data: { status: 'Approved' },
        });
      }
    }

    const updated = await prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { firstName: true, lastName: true, initials: true } },
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: { approver: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to process approval action', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to process action' });
  }
});

// GET /api/approvals/requests/:id
router.get('/requests/:id', requirePermission('approvals', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireFirm(req, res)) return;
    const { role, id: userId } = req.user!;
    const request = await prisma.approvalRequest.findFirst({
      where: { id: req.params.id, workflow: { firmId: req.user!.firmId! } },
      include: {
        requester: { select: { firstName: true, lastName: true, initials: true, email: true } },
        workflow: {
          select: {
            name: true,
            entityType: true,
            steps: { orderBy: { stepOrder: 'asc' } },
          },
        },
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: {
            approver: { select: { firstName: true, lastName: true, initials: true } },
          },
        },
      },
    });

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (
      !canViewApprovalRequest(role, userId, {
        requesterId: request.requesterId,
        approverIds: request.steps.map((s) => s.approverId),
        currentStep: request.currentStep,
        status: request.status,
        steps: request.steps,
        workflowSteps: request.workflow.steps,
      })
    ) {
      res.status(403).json({ error: 'You do not have access to this approval request' });
      return;
    }

    res.json(request);
  } catch (err) {
    logger.error('Failed to get approval request', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get request' });
  }
});

// GET /api/approvals/pending-count — count of requests awaiting user action
router.get('/pending-count', requirePermission('approvals', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireFirm(req, res)) return;
    const { id: userId, role } = req.user!;
    const firmId = req.user!.firmId!;

    const inProgress = await prisma.approvalRequest.findMany({
      where: {
        status: 'In Progress',
        workflow: { firmId },
      },
      include: {
        steps: true,
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      },
    });

    const count = inProgress.filter((r) =>
      isPendingApproverForUser(userId, role, r)
    ).length;

    res.json({ count });
  } catch (err) {
    logger.error('Failed to get pending count', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get count' });
  }
});

export default router;
