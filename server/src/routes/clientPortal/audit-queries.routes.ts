import { Router, Response } from 'express';
import { prisma } from '../../index.js';
import logger from '../../lib/logger.js';
import type { AuthRequest } from '../../middleware/auth.js';
import {
  createClientAuditQuerySchema,
  logClientQueryAudit,
  notifyStaffOfNewClientQuery,
} from '../../lib/clientAuditQueries.js';
import { getClientPortalScope } from './shared.js';

const router = Router();

// GET /api/client/audit-queries
router.get('/audit-queries', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;
    const engagementId = req.query.engagementId ? String(req.query.engagementId) : undefined;

    const queries = await prisma.clientAuditQuery.findMany({
      where: {
        clientId: scope.clientId,
        ...(engagementId ? { engagementId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { engagement: { select: { id: true, title: true } } },
    });

    res.json(
      queries.map((q) => ({
        id: q.id,
        subject: q.subject,
        body: q.body,
        status: q.status,
        response: q.response,
        respondedAt: q.respondedAt?.toISOString() ?? null,
        createdAt: q.createdAt.toISOString(),
        engagementId: q.engagement.id,
        engagementName: q.engagement.title,
      }))
    );
  } catch (err) {
    logger.error('Client portal - audit queries error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load queries' });
  }
});

// POST /api/client/audit-queries — structured audit query
router.post('/audit-queries', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const parsed = createClientAuditQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const { engagementId, subject, body } = parsed.data;

    const engagement = await prisma.engagement.findFirst({
      where: { id: engagementId, clientId: scope.clientId },
    });
    if (!engagement) {
      res.status(403).json({ error: 'Engagement not found' });
      return;
    }

    const query = await prisma.clientAuditQuery.create({
      data: {
        subject,
        body,
        engagementId: engagement.id,
        clientId: scope.clientId,
        createdById: req.user!.id,
      },
    });

    await notifyStaffOfNewClientQuery({
      engagementId: engagement.id,
      partnerInChargeId: engagement.partnerInChargeId,
      managerId: engagement.managerId,
      clientName: scope.clientName,
      subject,
      bodyPreview: body,
    });

    await logClientQueryAudit({
      userId: req.user!.id,
      action: 'CLIENT_QUERY_CREATED',
      entityId: query.id,
      details: JSON.stringify({ engagementId: engagement.id, subject }),
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    res.status(201).json(query);
  } catch (err) {
    logger.error('Client portal - create audit query error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create query' });
  }
});

export default router;
