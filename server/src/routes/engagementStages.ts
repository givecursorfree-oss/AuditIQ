import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { sendEmail, emailTemplates } from '../lib/emailService.js';
import { io } from '../index.js';
import { engagementAccessWhere } from '../lib/engagementAccess.js';
import logger from '../lib/logger.js';
import { clientStageLabel, notifyClientPortalUsers } from '../lib/clientScope.js';
import { postEngagementChatMessage } from '../lib/engagementChat.js';
import {
  WORKFLOW_TEMPLATES,
  type WorkflowDomain,
  resolveTemplateId,
  resolveWorkflowDomain,
  SERVICE_CATALOG,
  getStepsForService,
} from '../lib/workflowCatalog.js';
import {
  canRoleMoveToStep,
  canUserMoveToStep,
  checkWorkflowGating,
  clientStageLabelForCode,
  getEngagementWorkflowMeta,
  parseStoredStageToCode,
  stageCodeForStorage,
} from '../lib/workflowEngine.js';

const router = Router();
router.use(authenticate);

export const STAGES = [
  'Data Pending',
  'Data Received',
  'Execution (WIP)',
  'Draft Ready',
  'Review with Manager',
  'Partner Review',
  'Client Discussion',
  'UDIN Generated',
  'Filed',
  'Archived',
] as const;
export type Stage = (typeof STAGES)[number];

// Role gates per stage transition (who is allowed to MOVE to a given stage).
const STAGE_ROLE_GATES: Record<Stage, string[]> = {
  'Data Pending': ['Partner', 'Admin', 'Manager'],
  'Data Received': ['Partner', 'Admin', 'Manager', 'Staff'],
  'Execution (WIP)': ['Partner', 'Admin', 'Manager', 'Staff'],
  'Draft Ready': ['Partner', 'Admin', 'Manager', 'Staff'], // Article (Staff) can move to Draft Ready
  'Review with Manager': ['Partner', 'Admin', 'Manager', 'Staff'],
  'Partner Review': ['Partner', 'Admin', 'Manager'], // Manager moves to Partner Review
  'Client Discussion': ['Partner', 'Admin'],
  'UDIN Generated': ['Partner', 'Admin'],
  'Filed': ['Partner', 'Admin'], // Partner moves to Filed
  'Archived': ['Partner', 'Admin'],
};

function daysRemaining(deadline: Date | null | undefined): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (24 * 3600 * 1000));
}

function ragColor(days: number | null): 'red' | 'amber' | 'green' | 'gray' {
  if (days == null) return 'gray';
  if (days < 3) return 'red';
  if (days < 7) return 'amber';
  return 'green';
}

function deriveWorkflowStatus(currentCode: string, stepCodes: string[]): string {
  const idx = Math.max(0, stepCodes.indexOf(currentCode));
  if (currentCode === 'BILLING' || currentCode === 'ARCHIVED') return 'completed';
  if (currentCode === 'FILING' || currentCode === 'FILED') return 'filed';
  if (['SR_EXEC_REVIEW', 'MANAGER_REVIEW', 'PARTNER_REVIEW', 'CLIENT_REVIEW'].includes(currentCode)) return 'pending_review';
  if (idx <= 0) return 'not_started';
  return 'in_progress';
}

/** GET /api/engagement-stages/workflow-list — dashboard cards with filters */
router.get('/workflow-list', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const domainFilter = String(req.query.domain || '').toUpperCase();
    const statusFilter = String(req.query.status || '');
    const assignedTo = String(req.query.assignedTo || '');

    const engagements = await prisma.engagement.findMany({
      where: {
        ...engagementAccessWhere(user.id, user.role, user.firmId),
        currentStage: { notIn: ['Archived'] },
      },
        include: {
        client: { select: { id: true, name: true } },
      },
      orderBy: { deadline: 'asc' },
    });

    const checklistStats = await prisma.dataChecklistItem.groupBy({
      by: ['engagementId', 'status'],
      where: { engagementId: { in: engagements.map((e) => e.id) } },
      _count: true,
    });
    const receivedByEngagement = new Map<string, { total: number; received: number }>();
    for (const row of checklistStats) {
      const cur = receivedByEngagement.get(row.engagementId) ?? { total: 0, received: 0 };
      cur.total += row._count;
      if (row.status === 'Received' || row.status === 'Verified') cur.received += row._count;
      receivedByEngagement.set(row.engagementId, cur);
    }

    const userIds = new Set<string>();
    for (const e of engagements) {
      if (e.articleAssistantId) userIds.add(e.articleAssistantId);
      if (e.managerId) userIds.add(e.managerId);
      if (e.partnerInChargeId) userIds.add(e.partnerInChargeId);
    }
    const users =
      userIds.size > 0
        ? await prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    let items = engagements
      .map((e) => {
        const meta = getEngagementWorkflowMeta(e);
        const domain = meta.domain;
        if (domain !== 'DT' && domain !== 'IDT') return null;

        const svc = e.serviceCode
          ? SERVICE_CATALOG.find((s) => s.code === e.serviceCode)
          : SERVICE_CATALOG.find((s) => s.domain === domain);
        const steps = getStepsForService(e.serviceCode, meta.templateId);
        const stepCodes = steps.map((s) => s.code);
        const currentIdx = Math.max(0, stepCodes.indexOf(meta.currentCode));
        const status = deriveWorkflowStatus(meta.currentCode, stepCodes);
        const stats = receivedByEngagement.get(e.id);
        const dataRequestPercent =
          stats && stats.total > 0 ? Math.round((stats.received / stats.total) * 100) : undefined;
        const assigneeId = e.articleAssistantId ?? e.managerId;
        const days = daysRemaining(e.deadline);

        return {
          id: e.id,
          name: e.title,
          category: domain === 'DT' ? 'direct_tax' : 'indirect_tax',
          serviceCode: e.serviceCode,
          dueDate: e.deadline ? new Date(e.deadline).toISOString() : null,
          frequency: svc?.dueRule ?? 'Per engagement',
          clientId: e.clientId,
          clientName: e.client.name,
          assignedToId: assigneeId,
          assignedToName: assigneeId ? userMap.get(assigneeId) ?? null : null,
          partnerInChargeId: e.partnerInChargeId,
          managerId: e.managerId,
          articleAssistantId: e.articleAssistantId,
          partnerInChargeName: e.partnerInChargeId ? userMap.get(e.partnerInChargeId) ?? null : null,
          managerName: e.managerId ? userMap.get(e.managerId) ?? null : null,
          articleAssistantName: e.articleAssistantId ? userMap.get(e.articleAssistantId) ?? null : null,
          letterStatus: e.letterStatus,
          currentStageCode: meta.currentCode,
          currentStageLabel: meta.currentLabel,
          completedStageCodes: stepCodes.slice(0, currentIdx),
          steps: steps.map((s) => ({ code: s.code, label: s.label })),
          status,
          financialYear: e.financialYear,
          dataRequestPercent,
          daysRemaining: days,
          rag: ragColor(days),
          createdAt: e.createdAt.toISOString(),
          updatedAt: e.updatedAt.toISOString(),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (domainFilter === 'DT' || domainFilter === 'IDT') {
      items = items.filter((i) =>
        domainFilter === 'DT' ? i.category === 'direct_tax' : i.category === 'indirect_tax'
      );
    }
    if (statusFilter) {
      items = items.filter((i) => i.status === statusFilter);
    }
    if (assignedTo) {
      items = items.filter(
        (i) =>
          i.assignedToId === assignedTo ||
          i.partnerInChargeId === assignedTo ||
          i.managerId === assignedTo ||
          i.articleAssistantId === assignedTo
      );
    }

    const templates = SERVICE_CATALOG.filter((s) => s.domain === 'DT' || s.domain === 'IDT').map((s) => ({
      code: s.code,
      name: s.name,
      domain: s.domain,
      dueRule: s.dueRule ?? '',
      recurrence: s.recurrence,
      steps: getStepsForService(s.code, s.templateId as 'DT_COMPLIANCE' | 'IDT_GST_RETURN').map((st) => ({
        code: st.code,
        label: st.label,
      })),
    }));

    res.json({ engagements: items, templates });
  } catch (err) {
    logger.error('Workflow list error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load workflow engagements' });
  }
});

/** GET /api/engagement-stages/board — kanban by workflow domain (DT | IDT | AUDIT) */
router.get('/board', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const domainFilter = String(req.query.domain || 'AUDIT').toUpperCase() as WorkflowDomain;

    const engagements = await prisma.engagement.findMany({
      where: {
        ...engagementAccessWhere(user.id, user.role, user.firmId),
        currentStage: { notIn: ['Archived', 'Billing'] },
      },
      include: {
        client: { select: { id: true, name: true } },
      },
      orderBy: { deadline: 'asc' },
    });

    const filtered = engagements.filter((e) => {
      const domain = resolveWorkflowDomain(e);
      return domain === domainFilter;
    });

    const templateId =
      domainFilter === 'DT'
        ? 'DT_COMPLIANCE'
        : domainFilter === 'IDT'
          ? 'IDT_GST_RETURN'
          : 'AUDIT_STATUTORY';

    const usedStepCodes = new Set<string>();
    for (const e of filtered) {
      const tid = resolveTemplateId(e);
      for (const st of getStepsForService(e.serviceCode, tid)) {
        usedStepCodes.add(st.code);
      }
    }
    const defaultSteps = WORKFLOW_TEMPLATES[templateId].steps;
    const stageColumns: { code: string; label: string }[] = [];
    const seenCodes = new Set<string>();
    for (const st of defaultSteps) {
      if (usedStepCodes.size === 0 || usedStepCodes.has(st.code)) {
        if (!seenCodes.has(st.code)) {
          seenCodes.add(st.code);
          stageColumns.push({ code: st.code, label: st.label });
        }
      }
    }
    for (const e of filtered) {
      const tid = resolveTemplateId(e);
      for (const st of getStepsForService(e.serviceCode, tid)) {
        if (!seenCodes.has(st.code)) {
          seenCodes.add(st.code);
          stageColumns.push({ code: st.code, label: st.label });
        }
      }
    }

    const userMap = new Map<string, { id: string; firstName: string; lastName: string; initials: string }>();
    const userIds = new Set<string>();
    for (const e of filtered) {
      if (e.articleAssistantId) userIds.add(e.articleAssistantId);
      if (e.managerId) userIds.add(e.managerId);
      if (e.partnerInChargeId) userIds.add(e.partnerInChargeId);
    }
    if (userIds.size > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, firstName: true, lastName: true, initials: true },
      });
      for (const u of users) userMap.set(u.id, u);
    }

    const cards = filtered.map((e) => {
      const meta = getEngagementWorkflowMeta(e);
      const days = daysRemaining(e.deadline);
      return {
        id: e.id,
        clientId: e.clientId,
        clientName: e.client.name,
        title: e.title,
        type: e.type,
        financialYear: e.financialYear,
        workflowDomain: meta.domain,
        serviceCode: e.serviceCode,
        currentStage: meta.currentLabel,
        currentStageCode: meta.currentCode,
        deadline: e.deadline,
        daysRemaining: days,
        rag: ragColor(days),
        article: e.articleAssistantId ? userMap.get(e.articleAssistantId) : null,
        manager: e.managerId ? userMap.get(e.managerId) : null,
        partner: e.partnerInChargeId ? userMap.get(e.partnerInChargeId) : null,
        udin: e.udin,
      };
    });

    const board: Record<string, typeof cards> = {};
    for (const col of stageColumns) board[col.label] = [];
    for (const c of cards) {
      const bucket = c.currentStage;
      if (!board[bucket]) board[bucket] = [];
      board[bucket].push(c);
    }

    res.json({
      domain: domainFilter,
      templateId,
      stages: stageColumns.map((s) => s.label),
      stageColumns,
      board,
    });
  } catch (err) {
    logger.error('Kanban board error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load board' });
  }
});

/** GET /api/engagement-stages/:id/history */
router.get('/:id/history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const history = await prisma.engagementStageHistory.findMany({
      where: { engagementId: String(req.params.id), engagement: { firmId: req.user!.firmId! } },
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(history);
  } catch (err) {
    logger.error('Stage history error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load history' });
  }
});

const moveSchema = z.object({
  toStage: z.string().min(1),
  notes: z.string().optional(),
  udin: z.string().optional(),
  filingReferenceNo: z.string().optional(),
  filingAcknowledgmentNo: z.string().optional(),
  notifyClient: z.boolean().optional(),
});

/** POST /api/engagement-stages/:id/move — advance engagement to a workflow step */
router.post('/:id/move', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = moveSchema.parse(req.body);
    const eng = await prisma.engagement.findFirst({
      where: { id: String(req.params.id), firmId: req.user!.firmId! },
    });
    if (!eng) { res.status(404).json({ error: 'Engagement not found' }); return; }
    const client = await prisma.client.findUnique({
      where: { id: eng.clientId },
      include: { firm: true },
    });
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }

    const templateId = resolveTemplateId(eng);
    const meta = getEngagementWorkflowMeta(eng);
    let toCode = parseStoredStageToCode(body.toStage, templateId);
    const stepDef = WORKFLOW_TEMPLATES[templateId].steps.find((s) => s.code === toCode);
    if (!stepDef) {
      res.status(400).json({ error: `Invalid stage "${body.toStage}" for this engagement type` });
      return;
    }

    if (!canRoleMoveToStep(req.user!.role, toCode, templateId)) {
      res.status(403).json({
        error: `Your role cannot move engagements to "${stepDef.label}". This step is owned by ${stepDef.ownerTier}.`,
      });
      return;
    }

    const actor = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { hierarchyLevel: { select: { code: true } } },
    });
    if (!canUserMoveToStep(req.user!.role, actor?.hierarchyLevel?.code, toCode, templateId)) {
      res.status(403).json({
        error: `Your grade cannot move engagements to "${stepDef.label}". Senior executive check requires a Senior Audit Executive (or Manager/Partner).`,
      });
      return;
    }

    const gatingResult = await checkWorkflowGating(eng.id, eng, toCode, templateId);
    if (!gatingResult.allowed) {
      res.status(400).json({ error: gatingResult.blockers.join('; '), blockers: gatingResult.blockers });
      return;
    }

    const storedStage = stageCodeForStorage(toCode, templateId);
    const data: Record<string, unknown> = { currentStage: storedStage };
    if (body.udin) data.udin = body.udin;
    if (body.filingReferenceNo) data.filingReferenceNo = body.filingReferenceNo;
    if (body.filingAcknowledgmentNo) data.filingAcknowledgmentNo = body.filingAcknowledgmentNo;
    if (toCode === 'FILED' || toCode === 'FILING') data.filedAt = new Date();
    if (toCode === 'ARCHIVED' || toCode === 'BILLING') {
      if (toCode === 'ARCHIVED') data.archivedAt = new Date();
    }

    const updated = await prisma.$transaction(async (tx) => {
      const e = await tx.engagement.update({ where: { id: eng.id }, data });
      await tx.engagementStageHistory.create({
        data: {
          engagementId: eng.id,
          fromStage: eng.currentStage,
          toStage: storedStage,
          notes: body.notes,
          actorId: req.user!.id,
        },
      });
      // Notify partner-in-charge when moving to Partner Review
      if (toCode === 'PARTNER_REVIEW' && eng.partnerInChargeId) {
        await tx.notification.create({
          data: {
            userId: eng.partnerInChargeId,
            title: 'Engagement awaiting partner review',
            message: `${client.name} — ${eng.title}`,
            type: 'info',
            link: `/engagements/${eng.id}`,
          },
        });
      }
      return e;
    });

    await prisma.clientStopwatch.updateMany({
      where: { engagementId: eng.id },
      data: { stage: storedStage },
    });
    await prisma.staffWorkStatus.updateMany({
      where: { currentEngagementId: eng.id },
      data: { currentStage: storedStage },
    });

    // Notify client portal users (plain-language, no internal notes)
    const stageLabel = clientStageLabelForCode(toCode, templateId);
    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    await notifyClientPortalUsers(
      eng.clientId,
      {
        title: 'Engagement update',
        message: `Stage updated to: ${stageLabel} — ${dateStr}`,
        link: '/client/dashboard',
        type: 'info',
      },
      { preference: 'notifyStageChanges' }
    ).catch(() => {});

    const mover = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { firstName: true, lastName: true },
    });
    const moverName =
      `${mover?.firstName ?? ''} ${mover?.lastName ?? ''}`.trim() || req.user!.email;
    const stageSystemMsg = `Stage updated to: ${stageLabel} — ${dateStr}`;
    await postEngagementChatMessage(eng.id, req.user!.id, stageSystemMsg, 'system').catch(() => {});

    if (body.notes?.trim()) {
      const teamNote = `Workflow note (${meta.currentLabel} → ${stepDef.label}):\n\n${body.notes.trim()}\n\n— ${moverName}`;
      await postEngagementChatMessage(eng.id, req.user!.id, teamNote, 'text').catch(() => {});

      if (body.notifyClient !== false) {
        await notifyClientPortalUsers(
          eng.clientId,
          {
            title: 'Update on your engagement',
            message: `Your team shared an update on ${eng.title}. Open Messages to read and reply.`,
            link: '/client/dashboard',
            type: 'info',
          },
          { preference: 'notifyDocumentRequests' }
        ).catch(() => {});
      }
    }

    // Emit real-time event to engagement room
    io.to(`engagement:${eng.id}`).emit('stage-changed', {
      engagementId: eng.id,
      fromStage: eng.currentStage,
      toStage: storedStage,
      actorId: req.user!.id,
    });

    if ((toCode === 'FILED' || toCode === 'FILING') && client.contactEmail && eng.udin) {
      const { subject, body: html } = emailTemplates.filingConfirmation({
        firmName: client.firm.name,
        clientName: client.contactName || client.name,
        engagementTitle: eng.title,
        udin: (body.udin || eng.udin)!,
        filedOn: new Date(),
      });
      void sendEmail({
        to: client.contactEmail,
        subject,
        body: html,
        clientId: eng.clientId,
        engagementId: eng.id,
        templateKey: 'filing-confirmation',
      });
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Move stage error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to move engagement' });
  }
});

// Stage-gating logic
async function checkStageGating(
  engagementId: string,
  eng: { udin: string | null; partnerInChargeId: string | null },
  toStage: Stage
): Promise<{ allowed: boolean; blockers: string[] }> {
  const blockers: string[] = [];

  if (toStage === 'Review with Manager') {
    const missingItems = await prisma.dataChecklistItem.count({
      where: { engagementId, status: 'Missing' },
    });
    if (missingItems > 0) {
      blockers.push(`${missingItems} data checklist item(s) still marked "Missing". All required items must be received before Manager review.`);
    }
  }

  if (toStage === 'UDIN Generated') {
    if (!eng.udin) {
      blockers.push('UDIN must be entered before moving to "UDIN Generated".');
    }
  }

  if (toStage === 'Filed') {
    if (!eng.udin) {
      blockers.push('UDIN is mandatory before marking an engagement as Filed.');
    }
    const partnerSignoff = await prisma.signOff.findFirst({
      where: { engagementId, type: 'Partner', status: 'Approved' },
    });
    if (!partnerSignoff) {
      blockers.push('Partner sign-off is required before filing.');
    }
  }

  return { allowed: blockers.length === 0, blockers };
}

/** GET /api/engagement-stages/:id/workflow — template steps for one engagement */
router.get('/:id/workflow', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eng = await prisma.engagement.findFirst({
      where: { id: String(req.params.id), firmId: req.user!.firmId! },
    });
    if (!eng) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    const meta = getEngagementWorkflowMeta(eng);
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load workflow' });
  }
});

/** GET /api/engagement-stages/:id/can-move?toStage=X — pre-flight stage-gate check */
router.get('/:id/can-move', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const toStage = req.query.toStage as string;
    if (!toStage) {
      res.status(400).json({ error: 'toStage parameter required' });
      return;
    }

    const eng = await prisma.engagement.findFirst({
      where: { id: String(req.params.id), firmId: req.user!.firmId! },
    });
    if (!eng) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    const templateId = resolveTemplateId(eng);
    const toCode = parseStoredStageToCode(toStage, templateId);
    const stepDef = WORKFLOW_TEMPLATES[templateId].steps.find((s) => s.code === toCode);
    if (!stepDef) {
      res.status(400).json({ error: 'Invalid toStage for this engagement' });
      return;
    }

    const actor = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { hierarchyLevel: { select: { code: true } } },
    });
    const roleAllowed = canUserMoveToStep(
      req.user!.role,
      actor?.hierarchyLevel?.code,
      toCode,
      templateId
    );
    const gatingResult = await checkWorkflowGating(eng.id, eng, toCode, templateId);

    const allBlockers = [...gatingResult.blockers];
    if (!roleAllowed) {
      allBlockers.unshift(`Your grade cannot move engagements to "${stepDef.label}".`);
    }

    res.json({
      allowed: roleAllowed && gatingResult.allowed,
      blockers: allBlockers,
      currentStage: eng.currentStage,
      toStage: stepDef.label,
    });
  } catch (err) {
    logger.error('Can-move check error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to check stage gates' });
  }
});

export default router;
