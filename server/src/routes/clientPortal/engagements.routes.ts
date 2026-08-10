import { Router, Response } from 'express';
import { prisma } from '../../index.js';
import logger from '../../lib/logger.js';
import type { AuthRequest } from '../../middleware/auth.js';
import {
  clientProgressForEngagement,
  isEngagementActivated,
  stageDescriptionForClient,
} from '../../lib/clientScope.js';
import {
  buildClientPortalTimeline,
  getEngagementWorkflowMeta,
  parseStoredStageToCode,
} from '../../lib/workflowEngine.js';
import { resolveTemplateId } from '../../lib/workflowCatalog.js';
import { getClientPortalScope, listClientEngagements } from './shared.js';

const router = Router();

// GET /api/client/engagements — only this client's engagements with the firm
router.get('/engagements', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const engagements = await listClientEngagements(scope.clientId);

    const partnerIds = [...new Set(engagements.map((e) => e.partnerInChargeId).filter(Boolean))] as string[];
    const partners = partnerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true, firstName: true, lastName: true, designation: true },
        })
      : [];
    const partnerMap = new Map(partners.map((p) => [p.id, p]));

    const mapped = engagements.map((e) => {
      const activated = isEngagementActivated(e);
      const progress = clientProgressForEngagement(e);
      const meta = getEngagementWorkflowMeta(e);
      const pendingDocs = activated
        ? e.checklistItems.filter((c) => !['Received', 'Verified', 'Uploaded'].includes(c.status)).length
        : 0;
      const needsClientAction =
        activated &&
        pendingDocs > 0 &&
        ['DATA_PENDING', 'DATA_REQUEST', 'CLIENT_REQUEST', 'DATA_RECEIVED'].includes(meta.currentCode);
      const partner = e.partnerInChargeId ? partnerMap.get(e.partnerInChargeId) : null;

      return {
        id: e.id,
        name: e.title,
        type: e.type,
        status: activated ? e.status : 'Pending Allocation',
        currentStage: progress.currentStageLabel,
        workflowDomain: e.workflowDomain,
        serviceCode: e.serviceCode,
        stageDescription: activated
          ? progress.stageDescription
          : 'Your request has been received. The firm is assigning your engagement team — document upload will open once activation is complete.',
        assessmentYear: e.financialYear,
        referenceNo: `ENG-${e.createdAt.getFullYear()}-${e.id.slice(0, 4).toUpperCase()}`,
        startDate: e.startDate?.toISOString() ?? null,
        submittedAt: e.createdAt.toISOString(),
        endDate: e.deadline?.toISOString() ?? null,
        deadline: e.deadline?.toISOString() ?? null,
        filedAt: e.filedAt?.toISOString() ?? null,
        clientName: e.client?.name ?? '',
        progress: Math.round(((progress.progressStep + 1) / progress.progressSteps.length) * 100),
        progressStep: progress.progressStep,
        progressSteps: progress.progressSteps,
        documentCount: e._count.documents,
        checklistCount: e._count.checklistItems,
        pendingDocuments: pendingDocs,
        isActivated: activated,
        needsClientAction,
        partnerInCharge: partner
          ? {
              name: `${partner.firstName} ${partner.lastName}`,
              designation: partner.designation || 'Partner-in-Charge',
            }
          : null,
      };
    });

    res.json(mapped);
  } catch (err) {
    logger.error('Client portal - list engagements error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch engagements' });
  }
});

// GET /api/client/engagements/:id/timeline — workflow timeline for one engagement
router.get('/engagements/:id/timeline', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const engagementId = String(req.params.id);
    const engagement = await prisma.engagement.findFirst({
      where: { id: engagementId, clientId: scope.clientId },
      select: {
        id: true,
        title: true,
        currentStage: true,
        financialYear: true,
        deadline: true,
        serviceCode: true,
        workflowDomain: true,
        type: true,
        stageHistory: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStage: true,
            toStage: true,
            notes: true,
            createdAt: true,
            actor: { select: { firstName: true, lastName: true, role: true } },
          },
        },
      },
    });

    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    const templateId = resolveTemplateId(engagement);
    const timeline = buildClientPortalTimeline(engagement, engagement.stageHistory);

    res.json({
      engagementId: engagement.id,
      title: engagement.title,
      currentStage: timeline.currentStageLabel,
      financialYear: engagement.financialYear,
      deadline: engagement.deadline?.toISOString() ?? null,
      stages: timeline.stages,
      history: engagement.stageHistory.map((h) => ({
        id: h.id,
        fromStage: h.fromStage,
        toStage: h.toStage,
        timestamp: h.createdAt.toISOString(),
        description: stageDescriptionForClient(h.toStage),
        clientLabel: parseStoredStageToCode(h.toStage, templateId),
      })),
    });
  } catch (err) {
    logger.error('Client portal - timeline error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// GET /api/client/engagements/:id — single engagement detail (client-safe fields only)
router.get('/engagements/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const engagement = await prisma.engagement.findFirst({
      where: { id: String(req.params.id), clientId: scope.clientId },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        financialYear: true,
        currentStage: true,
        scopeIncluded: true,
        startDate: true,
        deadline: true,
        createdAt: true,
        filedAt: true,
        partnerInChargeId: true,
        managerId: true,
        articleAssistantId: true,
        checklistItems: {
          orderBy: { requestedAt: 'asc' },
          select: {
            id: true,
            title: true,
            status: true,
            requestedAt: true,
            receivedAt: true,
            revisionNotes: true,
            revisionRequestedAt: true,
          },
        },
        invoices: {
          select: { id: true, invoiceNo: true, totalAmount: true, status: true, dueDate: true, issueDate: true },
        },
        reports: {
          where: { sharedWithClient: true },
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            sharedWithClientAt: true,
            clientAcknowledgedAt: true,
            clientQueryText: true,
            clientQueryAt: true,
          },
        },
      },
    });

    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    const activated = isEngagementActivated(engagement);
    const pendingDocs = activated
      ? engagement.checklistItems.filter((c) => !['Received', 'Verified', 'Uploaded'].includes(c.status)).length
      : 0;
    const partner = engagement.partnerInChargeId
      ? await prisma.user.findUnique({
          where: { id: engagement.partnerInChargeId },
          select: { firstName: true, lastName: true, designation: true },
        })
      : null;

    res.json({
      id: engagement.id,
      name: engagement.title,
      type: engagement.type,
      financialYear: engagement.financialYear,
      referenceNo: `ENG-${engagement.createdAt.getFullYear()}-${engagement.id.slice(0, 4).toUpperCase()}`,
      submittedAt: engagement.createdAt.toISOString(),
      currentStage: engagement.currentStage,
      stageDescription: activated
        ? stageDescriptionForClient(engagement.currentStage)
        : 'Your request has been received. The firm is assigning your engagement team — document upload will open once activation is complete.',
      status: activated ? engagement.status : 'Pending Allocation',
      isActivated: activated,
      needsClientAction: activated && pendingDocs > 0,
      pendingDocuments: pendingDocs,
      scope: engagement.scopeIncluded,
      deadline: engagement.deadline?.toISOString() ?? null,
      partnerInCharge: partner
        ? {
            name: `${partner.firstName} ${partner.lastName}`,
            designation: partner.designation || 'Partner-in-Charge',
          }
        : null,
      checklist: engagement.checklistItems.map((c) => ({
        id: c.id,
        title: c.title,
        status:
          c.status === 'Revision Required'
            ? 'Revision Required'
            : c.status === 'Received'
              ? 'Uploaded'
              : c.status === 'Verified'
                ? 'Verified'
                : 'Pending',
        requestedAt: c.requestedAt.toISOString(),
        receivedAt: c.receivedAt?.toISOString() ?? null,
        revisionNotes: c.revisionNotes ?? null,
        revisionRequestedAt: c.revisionRequestedAt?.toISOString() ?? null,
      })),
      invoices: engagement.invoices.map((inv) => ({
        id: inv.id,
        number: inv.invoiceNo,
        amount: inv.totalAmount,
        status: inv.status,
        dueDate: inv.dueDate?.toISOString() ?? null,
        issueDate: inv.issueDate.toISOString(),
      })),
      sharedReports: engagement.reports.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        status: r.status,
        sharedAt: r.sharedWithClientAt?.toISOString() ?? null,
        acknowledgedAt: r.clientAcknowledgedAt?.toISOString() ?? null,
        clientQuery: r.clientQueryText,
        clientQueryAt: r.clientQueryAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    logger.error('Client portal - engagement detail error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch engagement' });
  }
});

export default router;
