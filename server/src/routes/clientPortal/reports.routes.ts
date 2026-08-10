import { Router, Response } from 'express';
import { prisma } from '../../index.js';
import logger from '../../lib/logger.js';
import type { AuthRequest } from '../../middleware/auth.js';
import {
  reportQueryBodySchema,
  logClientQueryAudit,
  notifyStaffOfNewClientQuery,
} from '../../lib/clientAuditQueries.js';
import { getClientPortalScope } from './shared.js';

const router = Router();

// GET /api/client/reports — shared reports across engagements
router.get('/reports', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const reports = await prisma.report.findMany({
      where: { sharedWithClient: true, engagement: { clientId: scope.clientId } },
      orderBy: { sharedWithClientAt: 'desc' },
      include: { engagement: { select: { id: true, title: true } } },
    });

    res.json(
      reports.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        status: r.status,
        sharedAt: r.sharedWithClientAt?.toISOString() ?? null,
        acknowledgedAt: r.clientAcknowledgedAt?.toISOString() ?? null,
        clientQuery: r.clientQueryText,
        clientQueryAt: r.clientQueryAt?.toISOString() ?? null,
        engagementId: r.engagement.id,
        engagementName: r.engagement.title,
      }))
    );
  } catch (err) {
    logger.error('Client portal - reports list error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load reports' });
  }
});

// POST /api/client/reports/:id/acknowledge
router.post('/reports/:id/acknowledge', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const report = await prisma.report.findFirst({
      where: {
        id: String(req.params.id),
        sharedWithClient: true,
        engagement: { clientId: scope.clientId },
      },
      include: { engagement: { select: { title: true, partnerInChargeId: true, managerId: true } } },
    });
    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: {
        clientAcknowledgedAt: new Date(),
        clientAcknowledgedById: req.user!.id,
      },
    });

    const notifyIds = [
      report.engagement.partnerInChargeId,
      report.engagement.managerId,
    ].filter(Boolean) as string[];
    if (notifyIds.length > 0) {
      await prisma.notification.createMany({
        data: notifyIds.map((uid) => ({
          userId: uid,
          title: 'Report acknowledged',
          message: `${scope.clientName || 'Client'} acknowledged "${report.title}".`,
          type: 'success' as const,
          link: `/engagements/${report.engagementId}`,
        })),
      }).catch(() => {});
    }

    res.json({
      id: updated.id,
      acknowledgedAt: updated.clientAcknowledgedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error('Client portal - acknowledge report error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to acknowledge report' });
  }
});

// POST /api/client/reports/:id/query — raise query on shared report
router.post('/reports/:id/query', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;
    const parsedBody = reportQueryBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: 'Validation failed', details: parsedBody.error.flatten() });
      return;
    }
    const queryText = (parsedBody.data.query ?? parsedBody.data.message ?? '').trim();

    const report = await prisma.report.findFirst({
      where: {
        id: String(req.params.id),
        sharedWithClient: true,
        engagement: { clientId: scope.clientId },
      },
      include: { engagement: true },
    });
    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: { clientQueryText: queryText, clientQueryAt: new Date() },
    });

    const auditQuery = await prisma.clientAuditQuery.create({
      data: {
        subject: `Query on report: ${report.title}`,
        body: queryText,
        engagementId: report.engagementId,
        clientId: scope.clientId,
        createdById: req.user!.id,
      },
    });

    await notifyStaffOfNewClientQuery({
      engagementId: report.engagementId,
      partnerInChargeId: report.engagement.partnerInChargeId,
      managerId: report.engagement.managerId,
      clientName: scope.clientName,
      subject: auditQuery.subject,
      bodyPreview: queryText,
    });

    await logClientQueryAudit({
      userId: req.user!.id,
      action: 'CLIENT_QUERY_CREATED',
      entityId: auditQuery.id,
      details: JSON.stringify({
        engagementId: report.engagementId,
        reportId: report.id,
        subject: auditQuery.subject,
      }),
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    res.json({
      id: updated.id,
      clientQuery: updated.clientQueryText,
      clientQueryAt: updated.clientQueryAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error('Client portal - report query error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to submit query' });
  }
});

export default router;
