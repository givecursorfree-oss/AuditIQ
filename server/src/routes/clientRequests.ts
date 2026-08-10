import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { authorize, type AuthRequest } from '../middleware/auth.js';
import { mapClientRequestRow } from '../lib/clientRequestMapper.js';
import { approveClientRequest } from '../use-cases/approveClientRequest.js';
import { rejectClientRequest } from '../use-cases/rejectClientRequest.js';
import { handleUseCaseError } from '../use-cases/handleUseCaseError.js';
import { notifyClientPortalUsers } from '../lib/clientScope.js';

const router = Router();

const engagementSelect = {
  id: true,
  title: true,
  serviceCode: true,
  letterStatus: true,
  requestStatus: true,
  status: true,
} as const;

// GET /api/requests?status=pending — firm leadership only (contains client PII)
router.get('/', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const status = (req.query.status as string) || undefined;
    const where: { firmId: string; status?: string } = { firmId: req.user!.firmId! };
    if (status) where.status = status;

    const requests = await prisma.clientRequest.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, contactEmail: true, pan: true, gstin: true } },
        engagements: { select: engagementSelect, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    res.json(requests.map(mapClientRequestRow));
  } catch (err) {
    logger.error('List client requests error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list requests' });
  }
});

// GET /api/requests/:id
router.get('/:id', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const row = await prisma.clientRequest.findFirst({
      where: { id: String(req.params.id), firmId: req.user!.firmId! },
      include: {
        client: true,
        engagements: {
          include: { engagementLetter: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!row) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    res.json(mapClientRequestRow(row));
  } catch (err) {
    logger.error('Get client request error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get request' });
  }
});

// PATCH /api/requests/:id/approve — one engagement per selected service
router.patch(
  '/:id/approve',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await approveClientRequest({
        requestId: String(req.params.id),
        firmId: req.user!.firmId!,
        reviewerId: req.user!.id,
      });
      res.json({
        requestId: result.requestId,
        engagements: result.engagements,
        primaryEngagementId: result.primaryEngagementId,
        engagement: result.engagements[0] ?? null,
        serviceCount: result.serviceCount,
      });
    } catch (err) {
      if (
        handleUseCaseError(err, res, 'Approve client request error', 'Failed to approve request')
      ) {
        return;
      }
    }
  }
);

// PATCH /api/requests/:id/reject
const rejectSchema = z.object({ reason: z.string().optional() });

router.patch(
  '/:id/reject',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = rejectSchema.parse(req.body ?? {});
      const result = await rejectClientRequest({
        requestId: String(req.params.id),
        firmId: req.user!.firmId!,
        reviewerId: req.user!.id,
        reason: body.reason ?? null,
      });
      const updated = await prisma.clientRequest.findUnique({ where: { id: result.requestId } });
      if (updated) {
        const reasonText = body.reason?.trim();
        await notifyClientPortalUsers(updated.clientId, {
          title: 'Service request update',
          message: reasonText
            ? `Your service request was not approved: ${reasonText}`
            : 'Your service request was not approved. Please contact the firm for details.',
          link: '/client/dashboard',
          type: 'warning',
        }).catch(() => {});
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      handleUseCaseError(err, res, 'Reject client request error', 'Failed to reject request');
    }
  }
);

export default router;
