import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth.js';
import {
  clientQueryAccessWhere,
  logClientQueryAudit,
  notifyClientOfQueryUpdate,
} from '../lib/clientAuditQueries.js';
import { requireEngagementAccess } from '../lib/engagementAccess.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

/** GET /api/client-queries — firm staff view client audit queries */
router.get('/', requirePermission('engagements', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const engagementId = req.query.engagementId ? String(req.query.engagementId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;

    const accessWhere = await clientQueryAccessWhere(user.id, user.role, user.firmId);
    if (!accessWhere) {
      res.status(403).json({ error: 'Firm context required' });
      return;
    }

    if (engagementId) {
      const allowed = await requireEngagementAccess(req, res, engagementId);
      if (!allowed) return;
    }

    const queries = await prisma.clientAuditQuery.findMany({
      where: {
        ...accessWhere,
        ...(engagementId ? { engagementId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        engagement: { select: { id: true, title: true } },
        client: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        respondedBy: { select: { firstName: true, lastName: true } },
      },
    });

    res.json(queries);
  } catch (err) {
    logger.error('List client queries error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load client queries' });
  }
});

/** GET /api/client-queries/open-summary — count + recent open queries for dashboard */
router.get('/open-summary', requirePermission('engagements', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const accessWhere = await clientQueryAccessWhere(user.id, user.role, user.firmId);
    if (!accessWhere) {
      res.status(403).json({ error: 'Firm context required' });
      return;
    }

    const where = { ...accessWhere, status: 'Open' as const };

    const [openCount, recent] = await Promise.all([
      prisma.clientAuditQuery.count({ where }),
      prisma.clientAuditQuery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          engagement: { select: { id: true, title: true } },
          client: { select: { id: true, name: true } },
        },
      }),
    ]);

    res.json({
      openCount,
      recent: recent.map((q) => ({
        id: q.id,
        subject: q.subject,
        status: q.status,
        createdAt: q.createdAt.toISOString(),
        engagementId: q.engagement.id,
        engagementTitle: q.engagement.title,
        clientName: q.client.name,
      })),
    });
  } catch (err) {
    logger.error('Open client queries summary error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load open client queries' });
  }
});

const respondSchema = z.object({
  response: z.string().trim().min(1).max(5000),
  status: z.enum(['Answered', 'Closed']).optional(),
});

/** PATCH /api/client-queries/:id/respond */
router.patch(
  '/:id/respond',
  requirePermission('engagements', 'edit'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = respondSchema.parse(req.body);
      const accessWhere = await clientQueryAccessWhere(req.user!.id, req.user!.role, req.user!.firmId);
      if (!accessWhere) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }

      const existing = await prisma.clientAuditQuery.findFirst({
        where: {
          id: String(req.params.id),
          ...accessWhere,
        },
        include: {
          createdBy: { select: { id: true, email: true } },
          engagement: { select: { id: true, title: true } },
        },
      });
      if (!existing) {
        res.status(404).json({ error: 'Query not found' });
        return;
      }

      const updated = await prisma.clientAuditQuery.update({
        where: { id: existing.id },
        data: {
          response: body.response,
          status: body.status ?? 'Answered',
          respondedAt: new Date(),
          respondedById: req.user!.id,
        },
      });

      await notifyClientOfQueryUpdate({
        clientUserId: existing.createdById,
        clientEmail: existing.createdBy.email,
        subject: existing.subject,
        title: 'Response to your query',
        message: `The firm responded to: ${existing.subject}`,
      });

      await logClientQueryAudit({
        userId: req.user!.id,
        action: 'CLIENT_QUERY_ANSWERED',
        entityId: existing.id,
        details: JSON.stringify({
          engagementId: existing.engagementId,
          engagementTitle: existing.engagement.title,
          subject: existing.subject,
        }),
        ipAddress: req.ip || req.socket.remoteAddress,
      });

      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Respond to client query error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to respond' });
    }
  }
);

/** PATCH /api/client-queries/:id/close — mark resolved without a written reply */
router.patch(
  '/:id/close',
  requirePermission('engagements', 'edit'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const accessWhere = await clientQueryAccessWhere(req.user!.id, req.user!.role, req.user!.firmId);
      if (!accessWhere) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }

      const existing = await prisma.clientAuditQuery.findFirst({
        where: {
          id: String(req.params.id),
          ...accessWhere,
        },
        include: {
          createdBy: { select: { id: true, email: true } },
          engagement: { select: { id: true, title: true } },
        },
      });
      if (!existing) {
        res.status(404).json({ error: 'Query not found' });
        return;
      }
      if (existing.status !== 'Open') {
        res.status(400).json({ error: 'Query is already closed' });
        return;
      }

      const updated = await prisma.clientAuditQuery.update({
        where: { id: existing.id },
        data: {
          status: 'Closed',
          respondedAt: new Date(),
          respondedById: req.user!.id,
        },
      });

      await notifyClientOfQueryUpdate({
        clientUserId: existing.createdById,
        clientEmail: existing.createdBy.email,
        subject: existing.subject,
        title: 'Query closed',
        message: `Your query "${existing.subject}" was marked closed by the firm.`,
      });

      await logClientQueryAudit({
        userId: req.user!.id,
        action: 'CLIENT_QUERY_CLOSED',
        entityId: existing.id,
        details: JSON.stringify({
          engagementId: existing.engagementId,
          engagementTitle: existing.engagement.title,
          subject: existing.subject,
        }),
        ipAddress: req.ip || req.socket.remoteAddress,
      });

      res.json(updated);
    } catch (err) {
      logger.error('Close client query error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to close query' });
    }
  }
);

export default router;
