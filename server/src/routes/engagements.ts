import { Router, Response } from 'express';
import fs from 'fs';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { generateEngagementLetterPdf } from '../lib/engagementLetterPdf.js';
import { provisionClientFolders } from '../lib/folderProvisioner.js';
import { generateSuggestedTasks, generateDataChecklist } from '../lib/suggestedTasks.js';
import { notifyClientPortalUsers } from '../lib/clientScope.js';
import { engagementAccessWhereForUser, requireEngagementAccess, getEngagementTeamMemberIds } from '../lib/engagementAccess.js';
import logger from '../lib/logger.js';
import { SERVICE_CATALOG, WORKFLOW_TEMPLATES, resolveTemplateId } from '../lib/workflowCatalog.js';
import { inferDomainFromEngagementType } from '../lib/workflowEngine.js';
import { assertTeamAssignmentAllowed, engagementHasTeam } from '../lib/letterGatePolicy.js';
import { validateResourceAssignees } from '../lib/assigneePolicy.js';
import { getEngagementTeam, setEngagementTeam, validateTeamUserRoles } from '../lib/engagementTeam.js';
import { syncEngagementChatParticipants } from '../lib/engagementChat.js';
import { computeNextCreateAt, ruleToScheduleFields } from '../lib/recurringScheduleHelpers.js';
import { RECURRING_SCHEDULE } from '../lib/recurringScheduler.js';

const router = Router();
router.use(authenticate);

const engagementSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['Statutory', 'Tax (44AB)', 'GST', 'Internal', 'Special']),
  financialYear: z.string().min(1),
  clientId: z.string().uuid(),
  scope: z.string().optional(),
  scopeIncluded: z.string().optional(),
  scopeExcluded: z.string().optional(),
  startDate: z.string().optional(),
  deadline: z.string().optional(),
  billingType: z.enum(['Fixed', 'Hourly', 'Retainer']).optional(),
  billingAmount: z.number().optional(),
  notes: z.string().optional(),
  memberIds: z.array(z.string().uuid()).optional(),
  partnerInChargeId: z.string().optional(),
  managerId: z.string().optional(),
  articleAssistantId: z.string().optional(),
  serviceCode: z.string().optional(),
  workflowDomain: z.enum(['DT', 'IDT', 'AUDIT']).optional(),
  isRecurring: z.boolean().optional(),
  recurringSchedule: z
    .object({
      frequency: z.enum(['monthly', 'quarterly', 'yearly']),
      triggerDay: z.number().int().min(1).max(31).optional(),
      triggerTime: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
      autoCreateStartDate: z.string().optional(),
      autoCreateEndDate: z.string().optional().nullable(),
      autoSendDataRequestLetter: z.boolean().default(true),
    })
    .optional(),
});

const querySchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

// GET /api/engagements
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = querySchema.parse(req.query);
    const skip = (Number(query.page) - 1) * Number(query.limit);

    const user = req.user!;
    const accessWhere = await engagementAccessWhereForUser(user.id);
    const where: Record<string, unknown> = { ...accessWhere };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.search) {
      const searchOr = [
        { title: { contains: query.search } },
        { client: { name: { contains: query.search } } },
      ];
      if (Array.isArray(accessWhere.OR)) {
        where.AND = [{ OR: accessWhere.OR }, { OR: searchOr }];
        delete where.OR;
      } else {
        where.OR = searchOr;
      }
    }

    const [engagements, total] = await Promise.all([
      prisma.engagement.findMany({
        where,
        skip,
        take: Number(query.limit),
        orderBy: { updatedAt: 'desc' },
        include: {
          client: { select: { id: true, name: true, cin: true, turnover: true } },
          members: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, role: true } } } },
          _count: { select: { workpapers: true, documents: true, observations: true } },
        },
      }),
      prisma.engagement.count({ where }),
    ]);

    res.json({ engagements, total, page: Number(query.page), totalPages: Math.ceil(total / Number(query.limit)) });
  } catch (err) {
    logger.error('List engagements error:', err);
    res.status(500).json({ error: 'Failed to fetch engagements' });
  }
});

/**
 * GET /api/engagements/portfolio?service=GST_MONTHLY_RETURNS
 * Multi-client single-window view: groups engagements of one service across all
 * clients (e.g. every GST Monthly Returns or ITR), with per-client status, stage,
 * deadline and current period for drill-down.
 */
router.get('/portfolio', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const service = req.query.service ? String(req.query.service) : undefined;
    if (!service) {
      res.status(400).json({ error: 'service query parameter is required' });
      return;
    }
    const accessWhere = await engagementAccessWhereForUser(user.id);

    const engagements = await prisma.engagement.findMany({
      where: {
        ...accessWhere,
        serviceCode: service,
        // Show recurring parents (or one-off engagements), not generated child periods.
        parentEngagementId: null,
      },
      orderBy: [{ client: { name: 'asc' } }, { updatedAt: 'desc' }],
      include: {
        client: { select: { id: true, name: true, gstin: true, pan: true } },
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, role: true } } },
        },
        periods: { orderBy: { periodKey: 'desc' }, take: 1 },
        _count: { select: { documents: true, childEngagements: true } },
      },
    });

    const rows = engagements.map((e) => ({
      id: e.id,
      clientId: e.client.id,
      clientName: e.client.name,
      gstin: e.client.gstin,
      pan: e.client.pan,
      title: e.title,
      status: e.status,
      currentStage: e.currentStage,
      deadline: e.deadline,
      financialYear: e.financialYear,
      isRecurring: e.isRecurring,
      latestPeriod: e.periods[0] ?? null,
      periodsCount: e._count.childEngagements,
      documentCount: e._count.documents,
      team: e.members.map((m) => ({
        id: m.user.id,
        name: `${m.user.firstName} ${m.user.lastName}`.trim(),
        initials: m.user.initials,
        teamRole: m.teamRole,
      })),
    }));

    const serviceMeta = SERVICE_CATALOG.find((s) => s.code === service);
    res.json({ service, serviceName: serviceMeta?.name ?? service, clientCount: rows.length, rows });
  } catch (err) {
    logger.error('Engagement portfolio error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load portfolio' });
  }
});

// GET /api/engagements/:id/command-center — hub metrics for engagement detail
router.get('/:id/command-center', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    if (!(await requireEngagementAccess(req, res, id))) return;
    const firmId = req.user!.firmId!;

    const engagement = await prisma.engagement.findFirst({
      where: { id, firmId },
      include: {
        client: { select: { id: true, name: true, contactEmail: true } },
        deadlines: { orderBy: { dueDate: 'asc' }, take: 5 },
        observations: {
          where: { status: { in: ['Open', 'Disputed'] } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, title: true, severity: true, status: true },
        },
        checklistItems: { select: { id: true, status: true } },
        documents: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            folder: true,
            category: true,
            createdAt: true,
          },
        },
        documentRequests: {
          where: { status: { in: ['Pending', 'Overdue'] } },
          select: { id: true, title: true, status: true },
        },
        invoices: {
          orderBy: { issueDate: 'desc' },
          take: 3,
          select: { id: true, invoiceNo: true, status: true, totalAmount: true, paidAmount: true },
        },
        stageHistory: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, toStage: true } },
        _count: {
          select: {
            observations: true,
            checklistItems: true,
            documents: true,
            workpapers: true,
          },
        },
      },
    });

    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    const teamIds = [
      engagement.partnerInChargeId,
      engagement.managerId,
      engagement.articleAssistantId,
    ].filter(Boolean) as string[];

    const teamUsers =
      teamIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: teamIds } },
            select: { id: true, firstName: true, lastName: true, initials: true, role: true },
          })
        : [];

    const teamMap = new Map(teamUsers.map((u) => [u.id, u]));
    const checklistTotal = engagement.checklistItems.length;
    const checklistDone = engagement.checklistItems.filter((c) => c.status === 'Received').length;
    const checklistPct = checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : 0;

    const openClientQueries = await prisma.clientAuditQuery.count({
      where: { engagementId: id, status: 'Open' },
    });

    let deadlineRag: 'green' | 'amber' | 'red' | 'neutral' = 'neutral';
    if (engagement.deadline) {
      const days = Math.ceil(
        (new Date(engagement.deadline).getTime() - Date.now()) / (24 * 3600 * 1000)
      );
      if (days < 0) deadlineRag = 'red';
      else if (days <= 3) deadlineRag = 'red';
      else if (days <= 7) deadlineRag = 'amber';
      else deadlineRag = 'green';
    }

    res.json({
      engagement: {
        id: engagement.id,
        title: engagement.title,
        type: engagement.type,
        status: engagement.status,
        currentStage: engagement.currentStage,
        financialYear: engagement.financialYear,
        deadline: engagement.deadline,
        udin: engagement.udin,
        filedAt: engagement.filedAt,
      },
      client: engagement.client,
      team: {
        partner: engagement.partnerInChargeId
          ? teamMap.get(engagement.partnerInChargeId) ?? null
          : null,
        manager: engagement.managerId ? teamMap.get(engagement.managerId) ?? null : null,
        staff: engagement.articleAssistantId
          ? teamMap.get(engagement.articleAssistantId) ?? null
          : null,
      },
      metrics: {
        checklistPct,
        checklistTotal,
        checklistDone,
        openObservations: engagement.observations.length,
        pendingClientDocs: engagement.documentRequests.length,
        openClientQueries,
        workpaperCount: engagement._count.workpapers,
        deadlineRag,
      },
      observations: engagement.observations,
      pendingRequests: engagement.documentRequests,
      recentDocuments: engagement.documents,
      invoices: engagement.invoices,
      upcomingDeadlines: engagement.deadlines,
      lastActivity: engagement.stageHistory[0] ?? null,
    });
  } catch (err) {
    logger.error('Engagement command center error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load command center' });
  }
});

// GET /api/engagements/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    if (!(await requireEngagementAccess(req, res, id))) return;
    const engagement = await prisma.engagement.findFirst({
      where: { id, firmId: req.user!.firmId! },
      include: {
        client: true,
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, role: true, designation: true } } } },
        workpapers: { orderBy: { reference: 'asc' } },
        documents: { orderBy: { createdAt: 'desc' }, take: 20 },
        observations: { orderBy: { createdAt: 'desc' } },
        deadlines: { orderBy: { dueDate: 'asc' } },
        _count: { select: { workpapers: true, documents: true, observations: true, timeEntries: true } },
      },
    });
    if (!engagement) { res.status(404).json({ error: 'Engagement not found' }); return; }

    let recurringAutomationActive: boolean | null = null;
    if (engagement.isRecurring && engagement.serviceCode) {
      const schedule = await prisma.recurringSchedule.findUnique({
        where: {
          clientId_engagementTemplateId: {
            clientId: engagement.clientId,
            engagementTemplateId: engagement.serviceCode,
          },
        },
        select: { isActive: true },
      });
      recurringAutomationActive = schedule?.isActive ?? null;
    }

    res.json({ ...engagement, recurringAutomationActive });
  } catch (err) {
    logger.error('Get engagement error:', err);
    res.status(500).json({ error: 'Failed to fetch engagement' });
  }
});

// POST /api/engagements
router.post('/', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = engagementSchema.parse(req.body);
    const { memberIds, startDate, deadline, serviceCode, workflowDomain, isRecurring, recurringSchedule, ...rest } = data;

    let domain = workflowDomain;
    if (serviceCode) {
      const svc = SERVICE_CATALOG.find((s) => s.code === serviceCode);
      if (svc) domain = svc.domain;
    }
    if (!domain) domain = inferDomainFromEngagementType(rest.type);

    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(403).json({ error: 'Firm context required' });
      return;
    }

    const client = await prisma.client.findFirst({
      where: { id: rest.clientId, firmId },
      select: { id: true },
    });
    if (!client) {
      res.status(400).json({ error: 'Client not found in your firm' });
      return;
    }

    if (memberIds?.length) {
      const members = await prisma.user.findMany({
        where: { id: { in: memberIds }, firmId, isActive: true, role: { not: 'Client' } },
        select: { id: true },
      });
      if (members.length !== memberIds.length) {
        res.status(400).json({ error: 'One or more team members are invalid for this firm' });
        return;
      }
    }

    const templateId = resolveTemplateId({
      workflowDomain: domain,
      serviceCode: serviceCode ?? null,
      type: rest.type,
    });
    const firstStep = WORKFLOW_TEMPLATES[templateId].steps[0];
    const initialStage =
      templateId === 'AUDIT_STATUTORY' ? 'Data Pending' : firstStep.label;

    const engagement = await prisma.engagement.create({
      data: {
        ...rest,
        serviceCode: serviceCode ?? null,
        workflowDomain: domain,
        currentStage: initialStage,
        requestStatus: 'awaiting_letter_signature',
        letterStatus: 'draft',
        isRecurring: isRecurring ?? false,
        recurringFrequency: recurringSchedule?.frequency,
        startDate: startDate ? new Date(startDate) : undefined,
        deadline: deadline ? new Date(deadline) : undefined,
        firmId,
        members: memberIds?.length ? {
          create: memberIds.map(userId => ({ userId, role: 'Preparer' })),
        } : undefined,
      },
      include: {
        client: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } } },
      },
    });

    if (serviceCode) {
      try {
        const checklistCount = await generateDataChecklist(prisma, engagement.id, engagement.type, serviceCode);
        logger.info('Service checklist seeded on create', { engagementId: engagement.id, serviceCode, checklistCount });
      } catch (err) {
        logger.error('Failed to seed service checklist', { error: (err as Error).message });
      }
    }

    if (isRecurring && serviceCode && recurringSchedule) {
      const catalogRule = RECURRING_SCHEDULE.find((r) => r.serviceCode === serviceCode);
      const fields = catalogRule ? ruleToScheduleFields(catalogRule) : {
        frequency: recurringSchedule.frequency,
        triggerDay: recurringSchedule.triggerDay ?? null,
        triggerTime: recurringSchedule.triggerTime,
        triggerDates: null as string | null,
        triggerMonth: null as string | null,
      };
      const autoCreateStartDate = recurringSchedule.autoCreateStartDate
        ? new Date(recurringSchedule.autoCreateStartDate)
        : new Date();
      const scheduleData = {
        engagementTemplateId: serviceCode,
        clientId: rest.clientId,
        isActive: true,
        frequency: fields.frequency,
        triggerDay: fields.triggerDay ?? recurringSchedule.triggerDay ?? null,
        triggerTime: recurringSchedule.triggerTime ?? fields.triggerTime,
        triggerDates: fields.triggerDates,
        triggerMonth: fields.triggerMonth,
        autoCreateStartDate,
        autoCreateEndDate: recurringSchedule.autoCreateEndDate
          ? new Date(recurringSchedule.autoCreateEndDate)
          : null,
        autoSendDataRequestLetter: recurringSchedule.autoSendDataRequestLetter,
        createdById: req.user!.id,
      };
      const nextCreateAt = computeNextCreateAt(scheduleData);
      await prisma.recurringSchedule.upsert({
        where: {
          clientId_engagementTemplateId: {
            clientId: rest.clientId,
            engagementTemplateId: serviceCode,
          },
        },
        create: { ...scheduleData, nextCreateAt },
        update: { ...scheduleData, nextCreateAt, isActive: true },
      });
    }

    res.status(201).json(engagement);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    logger.error('Create engagement error:', err);
    res.status(500).json({ error: 'Failed to create engagement' });
  }
});

// PUT /api/engagements/:id
router.put('/:id', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    if (!(await requireEngagementAccess(req, res, id))) return;

    const data = engagementSchema.partial().parse(req.body);
    const { memberIds, startDate, deadline, clientId, ...rest } = data;

    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, firmId: req.user!.firmId! },
        select: { id: true },
      });
      if (!client) {
        res.status(400).json({ error: 'Client not found in your firm' });
        return;
      }
    }

    const updated = await prisma.engagement.updateMany({
      where: { id, firmId: req.user!.firmId! },
      data: {
        ...rest,
        ...(clientId && { clientId }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(deadline && { deadline: new Date(deadline) }),
      },
    });
    if (updated.count === 0) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    const engagement = await prisma.engagement.findFirst({
      where: { id, firmId: req.user!.firmId! },
      include: { client: { select: { id: true, name: true } } },
    });

    res.json(engagement);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    logger.error('Update engagement error:', err);
    res.status(500).json({ error: 'Failed to update engagement' });
  }
});

// PATCH /api/engagements/:id/status
router.patch('/:id/status', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    if (!(await requireEngagementAccess(req, res, id))) return;

    const { status, progress } = req.body;
    const result = await prisma.engagement.updateMany({
      where: { id, firmId: req.user!.firmId! },
      data: { ...(status && { status }), ...(progress !== undefined && { progress }) },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    const updated = await prisma.engagement.findFirst({ where: { id, firmId: req.user!.firmId! } });
    res.json(updated);
  } catch (err) {
    logger.error('Update status error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PATCH /api/engagements/:id/resources — assign Partner-in-Charge / Manager / Article
const resourceSchema = z.object({
  partnerInChargeId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  articleAssistantId: z.string().nullable().optional(),
});
router.patch(
  '/:id/resources',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = resourceSchema.parse(req.body);
      const eng = await prisma.engagement.findFirst({
        where: { id: String(req.params.id), firmId: req.user!.firmId! },
      });
      if (!eng) { res.status(404).json({ error: 'Engagement not found' }); return; }

      const assigningTeam =
        body.partnerInChargeId !== undefined ||
        body.managerId !== undefined ||
        body.articleAssistantId !== undefined;
      const gate = assertTeamAssignmentAllowed(
        eng.letterStatus,
        assigningTeam,
        engagementHasTeam(eng)
      );
      if (!gate.allowed) {
        res.status(403).json({
          error: gate.error,
          letterStatus: gate.letterStatus,
        });
        return;
      }

      // Verify referenced users belong to the same firm
      const ids = [body.partnerInChargeId, body.managerId, body.articleAssistantId].filter(Boolean) as string[];
      if (ids.length > 0) {
        const users = await prisma.user.findMany({
          where: { id: { in: ids }, firmId: req.user!.firmId! },
          select: {
            id: true,
            role: true,
            hierarchyLevel: { select: { code: true } },
          },
        });
        if (users.length !== ids.length) {
          res.status(400).json({ error: 'One or more users are not in your firm' });
          return;
        }
        const slotCheck = validateResourceAssignees(users, body);
        if (!slotCheck.valid) {
          res.status(400).json({ error: slotCheck.error });
          return;
        }
      }

    const updateData: {
      partnerInChargeId?: string | null;
      managerId?: string | null;
      articleAssistantId?: string | null;
    } = {};
    if (body.partnerInChargeId !== undefined) updateData.partnerInChargeId = body.partnerInChargeId;
    if (body.managerId !== undefined) updateData.managerId = body.managerId;
    if (body.articleAssistantId !== undefined) updateData.articleAssistantId = body.articleAssistantId;

    const wasInactive = !eng.partnerInChargeId && !eng.managerId && !eng.articleAssistantId;
    const nowActive = !!(
      (body.partnerInChargeId ?? eng.partnerInChargeId) ||
      (body.managerId ?? eng.managerId) ||
      (body.articleAssistantId ?? eng.articleAssistantId)
    );

    const updated = await prisma.engagement.update({
      where: { id: eng.id },
      data: {
        ...updateData,
        ...(wasInactive && nowActive && eng.letterStatus === 'signed'
          ? { requestStatus: 'team_assigned' }
          : {}),
      },
    });

    // Auto-generate suggested tasks for the primary assignee (article assistant or manager)
    const primaryAssignee = body.articleAssistantId || body.managerId;
    if (primaryAssignee) {
      try {
        const taskCount = await generateSuggestedTasks(
          prisma,
          eng.id,
          eng.type,
          primaryAssignee,
          req.user!.id,
          eng.deadline,
          eng.serviceCode
        );
        const checklistCount = await generateDataChecklist(prisma, eng.id, eng.type, eng.serviceCode);
        logger.info('Auto-generated tasks and checklist', { engagementId: eng.id, taskCount, checklistCount });
      } catch (err) {
        logger.error('Failed to auto-generate tasks', { error: (err as Error).message });
      }

      // Auto-create engagement chat room
      try {
        const existingRoom = await prisma.chatRoom.findFirst({ where: { engagementId: eng.id } });
        if (!existingRoom) {
          const chatParticipantIds = new Set<string>();
          if (body.partnerInChargeId) chatParticipantIds.add(body.partnerInChargeId);
          if (body.managerId) chatParticipantIds.add(body.managerId);
          if (body.articleAssistantId) chatParticipantIds.add(body.articleAssistantId);
          chatParticipantIds.add(req.user!.id);

          const portalUsers = await prisma.clientPortalUser.findMany({
            where: { clientId: eng.clientId, isActive: true },
            select: { userId: true },
          });
          for (const pu of portalUsers) if (pu.userId) chatParticipantIds.add(pu.userId);

          await prisma.chatRoom.create({
            data: {
              name: eng.title,
              type: 'group',
              engagementId: eng.id,
              participants: {
                create: Array.from(chatParticipantIds).map((userId) => ({ userId })),
              },
            },
          });
        }
      } catch (chatErr) {
        logger.error('Failed to create engagement chat room', { error: (chatErr as Error).message });
      }

      // Notify assigned employees
      const assigneeIds = [body.partnerInChargeId, body.managerId, body.articleAssistantId].filter(Boolean) as string[];
      for (const uid of assigneeIds) {
        if (uid === req.user!.id) continue;
        await prisma.notification.create({
          data: {
            userId: uid,
            title: 'Engagement assigned to you',
            message: `You have been assigned to "${eng.title}" for ${eng.type} engagement.`,
            type: 'info',
            link: `/engagements/${eng.id}`,
          },
        }).catch(() => {});
      }

      const wasInactiveNotify = !eng.partnerInChargeId && !eng.managerId && !eng.articleAssistantId;
      const nowActiveNotify = !!(body.partnerInChargeId || body.managerId || body.articleAssistantId);
      if (wasInactiveNotify && nowActiveNotify) {
        await notifyClientPortalUsers(eng.clientId, {
          title: 'Engagement activated',
          message: `Your engagement "${eng.title}" is now active. You can upload documents and message your team.`,
          link: '/client/dashboard',
          type: 'success',
        }).catch(() => {});
      }
    }

    res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Assign resources error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to assign resources' });
    }
  }
);

// POST /api/engagements/:id/engagement-letter — generate Engagement Letter PDF
// Partner only (per PRD: only Partners can sign off the Engagement Letter)
router.post(
  '/:id/engagement-letter',
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = z.object({
        scopeIncluded: z.string().optional(),
        scopeExcluded: z.string().optional(),
        fees: z.number().optional(),
        timelineFrom: z.string().optional(),
        timelineTo: z.string().optional(),
        sign: z.boolean().default(false),
      }).parse(req.body || {});

      const eng = await prisma.engagement.findFirst({
        where: { id: String(String(req.params.id)), firmId: req.user!.firmId! },
      });
      if (!eng) { res.status(404).json({ error: 'Engagement not found' }); return; }

      const [client, firm] = await Promise.all([
        prisma.client.findUnique({ where: { id: eng.clientId } }),
        prisma.firm.findUnique({ where: { id: eng.firmId } }),
      ]);
      if (!client || !firm) {
        res.status(404).json({ error: 'Client or firm not found' });
        return;
      }

      // Persist scope fields if provided
      if (body.scopeIncluded || body.scopeExcluded) {
        await prisma.engagement.update({
          where: { id: eng.id },
          data: {
            scopeIncluded: body.scopeIncluded ?? eng.scopeIncluded,
            scopeExcluded: body.scopeExcluded ?? eng.scopeExcluded,
          },
        });
      }

      // Ensure folder structure exists
      try { await provisionClientFolders(client.name, eng.financialYear); } catch { /* noop */ }

      const me = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { firstName: true, lastName: true, designation: true },
      });

      const filePath = await generateEngagementLetterPdf({
        firm,
        client,
        engagement: {
          title: eng.title,
          type: eng.type,
          financialYear: eng.financialYear,
          scopeIncluded: body.scopeIncluded ?? eng.scopeIncluded,
          scopeExcluded: body.scopeExcluded ?? eng.scopeExcluded,
          fees: body.fees ?? eng.billingAmount,
          timelineFrom: body.timelineFrom ? new Date(body.timelineFrom) : eng.startDate,
          timelineTo: body.timelineTo ? new Date(body.timelineTo) : eng.deadline,
        },
        partner: {
          name: `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim() || 'Partner',
          designation: me?.designation || 'Partner',
        },
      });

      await prisma.engagement.update({
        where: { id: eng.id },
        data: {
          elGenerated: true,
          elStoragePath: filePath,
          elSignedAt: body.sign ? new Date() : eng.elSignedAt,
          elSignedById: body.sign ? req.user!.id : eng.elSignedById,
        },
      });

      res.json({ ok: true, filePath, downloadUrl: `/api/engagements/${eng.id}/engagement-letter/download` });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('EL generation error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to generate Engagement Letter' });
    }
  }
);

// GET /api/engagements/:id/engagement-letter/download
router.get('/:id/engagement-letter/download', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const eng = await prisma.engagement.findFirst({
      where: { id: String(req.params.id), firmId: req.user!.firmId! },
      select: { elStoragePath: true, title: true },
    });
    if (!eng || !eng.elStoragePath) { res.status(404).json({ error: 'No Engagement Letter generated yet' }); return; }
    if (!fs.existsSync(eng.elStoragePath)) {
      res.status(404).json({ error: 'EL file missing on disk; please regenerate' });
      return;
    }
    res.download(eng.elStoragePath, `EL-${eng.title.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`);
  } catch (err) {
    logger.error('EL download error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to download EL' });
  }
});

const teamPutSchema = z.object({
  managerIds: z.array(z.string()).default([]),
  staffIds: z.array(z.string()).default([]),
  partnerId: z.string().nullable().optional(),
});

/** GET /api/engagements/:id/team */
router.get('/:id/team', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    if (!(await requireEngagementAccess(req, res, id))) return;
    const team = await getEngagementTeam(id);
    if (!team) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.json(team);
  } catch (err) {
    logger.error('Get engagement team error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load team' });
  }
});

/** PUT /api/engagements/:id/team — multi-select managers + staff */
router.put(
  '/:id/team',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const body = teamPutSchema.parse(req.body);
      const eng = await prisma.engagement.findFirst({
        where: { id, firmId: req.user!.firmId! },
      });
      if (!eng) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }

      const hasTeamNow = !!(body.partnerId || body.managerIds.length > 0 || body.staffIds.length > 0);
      const gate = assertTeamAssignmentAllowed(eng.letterStatus, hasTeamNow, engagementHasTeam(eng));
      if (!gate.allowed) {
        res.status(403).json({
          error: gate.error,
          letterStatus: gate.letterStatus,
        });
        return;
      }

      const allIds = [...new Set([...body.managerIds, ...body.staffIds, body.partnerId].filter(Boolean))] as string[];
      if (allIds.length > 0) {
        const users = await prisma.user.findMany({
          where: { id: { in: allIds }, firmId: req.user!.firmId! },
          select: { id: true, role: true },
        });
        if (users.length !== allIds.length) {
          res.status(400).json({ error: 'One or more users are not in your firm' });
          return;
        }
        const roleErr = validateTeamUserRoles(users, body.managerIds, body.staffIds);
        if (roleErr) {
          res.status(400).json({ error: roleErr });
          return;
        }
      }

      const wasInactive = !eng.partnerInChargeId && !eng.managerId && !eng.articleAssistantId;
      const assigningTeamNow = hasTeamNow;

      await setEngagementTeam(id, body.managerIds, body.staffIds, req.user!.id, body.partnerId);

      // Keep the engagement chat room's member list in sync with the new team
      // so reassigned staff appear (and removed staff disappear) immediately.
      try {
        await syncEngagementChatParticipants(id);
      } catch (syncErr) {
        logger.error('Failed to sync engagement chat participants', {
          engagementId: id,
          error: (syncErr as Error).message,
        });
      }

      if (wasInactive && assigningTeamNow && eng.letterStatus === 'signed') {
        await prisma.engagement.update({
          where: { id },
          data: { requestStatus: 'team_assigned' },
        });
      }

      const primaryAssignee = body.staffIds[0] || body.managerIds[0];
      if (primaryAssignee && wasInactive) {
        try {
          const taskCount = await generateSuggestedTasks(
            prisma,
            eng.id,
            eng.type,
            primaryAssignee,
            req.user!.id,
            eng.deadline,
            eng.serviceCode
          );
          const checklistCount = await generateDataChecklist(prisma, eng.id, eng.type, eng.serviceCode);
          logger.info('Auto-generated tasks and checklist (team PUT)', {
            engagementId: eng.id,
            taskCount,
            checklistCount,
          });
        } catch (err) {
          logger.error('Failed to auto-generate tasks (team PUT)', { error: (err as Error).message });
        }
      }

      const team = await getEngagementTeam(id);
      res.json(team);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Update engagement team error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to update team' });
    }
  }
);

/**
 * PATCH /api/engagements/:id/recurring — per-engagement stop/start of recurring
 * automation. Toggles the matching per-client RecurringSchedule (client + service),
 * so each recurring engagement (e.g. GST Monthly Returns vs TDS) is paused
 * independently without touching the client-wide automation flag.
 */
router.patch(
  '/:id/recurring',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const isActive = z.object({ isActive: z.boolean() }).parse(req.body).isActive;
      const eng = await prisma.engagement.findFirst({
        where: { id: String(req.params.id), firmId: req.user!.firmId! },
        select: { id: true, clientId: true, serviceCode: true, isRecurring: true },
      });
      if (!eng) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }
      if (!eng.isRecurring || !eng.serviceCode) {
        res.status(400).json({ error: 'This engagement is not recurring' });
        return;
      }
      const schedule = await prisma.recurringSchedule.findUnique({
        where: {
          clientId_engagementTemplateId: {
            clientId: eng.clientId,
            engagementTemplateId: eng.serviceCode,
          },
        },
      });
      if (!schedule) {
        res.status(404).json({ error: 'No recurring schedule found for this engagement' });
        return;
      }
      const updated = await prisma.recurringSchedule.update({
        where: { id: schedule.id },
        data: { isActive },
      });
      res.json({ id: eng.id, isActive: updated.isActive });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Toggle engagement recurring error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to update recurring automation' });
    }
  }
);

export default router;
