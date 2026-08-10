import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { clientQueryAccessWhere } from '../lib/clientAuditQueries.js';
import {
  engagementAccessWhere,
  listAccessibleEngagementIds,
} from '../lib/engagementAccess.js';
import { isFirmLeadershipRole, isPrivilegedRole } from '../lib/permissions.js';
import logger from '../lib/logger.js';
import { buildDashboardActionQueue } from '../lib/dashboardActionQueue.js';

const router = Router();
router.use(authenticate);

// GET /api/dashboard
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const firmId = user.firmId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const engWhere = engagementAccessWhere(user.id, user.role, firmId);
    const privileged = isPrivilegedRole(user.role);
    const accessibleIds = privileged
      ? null
      : await listAccessibleEngagementIds(user.id, user.role, firmId);

    const clientWhere = privileged
      ? { firmId: firmId!, isActive: true }
      : {
          firmId: firmId!,
          isActive: true,
          engagements: { some: engWhere },
        };

    const activityWhere = privileged
      ? { createdAt: { gte: thirtyDaysAgo }, user: { firmId } }
      : {
          createdAt: { gte: thirtyDaysAgo },
          OR: [
            { userId: user.id },
            ...(accessibleIds && accessibleIds.length > 0
              ? [{ entity: 'Engagement', entityId: { in: accessibleIds } }]
              : []),
          ],
        };

    // Parallel queries for dashboard stats
    const [
      totalClients,
      totalEngagements,
      engagementsByStatus,
      activeEngagements,
      overdueDeadlines,
      recentActivity,
      teamMembers,
      monthlyHours,
    ] = await Promise.all([
      prisma.client.count({ where: clientWhere }),

      prisma.engagement.count({ where: engWhere }),

      prisma.engagement.groupBy({
        by: ['status'],
        where: engWhere,
        _count: { id: true },
      }),

      prisma.engagement.findMany({
        where: {
          ...engWhere,
          status: { in: ['Planning', 'Fieldwork', 'Under Review', 'Reporting'] },
        },
        take: 15,
        orderBy: [{ deadline: 'asc' }, { updatedAt: 'desc' }],
        include: {
          client: { select: { name: true } },
          members: {
            include: { user: { select: { firstName: true, lastName: true, initials: true } } },
          },
          _count: { select: { workpapers: true, documents: true, observations: true } },
        },
      }),

      prisma.deadline.count({
        where: {
          engagement: engWhere,
          dueDate: { lt: now },
          status: { not: 'Completed' },
        },
      }),

      prisma.auditLog.findMany({
        where: activityWhere,
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true, initials: true } },
        },
      }),

      privileged
        ? prisma.user.count({ where: { firmId: firmId!, isActive: true } })
        : (accessibleIds?.length
            ? prisma.engagementMember
                .findMany({
                  where: { engagementId: { in: accessibleIds } },
                  select: { userId: true },
                })
                .then((rows) => new Set(rows.map((r) => r.userId)).size)
            : Promise.resolve(1)),

      privileged
        ? prisma.timeEntry.aggregate({
            where: {
              user: { firmId },
              date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
            },
            _sum: { hours: true },
          })
        : prisma.timeEntry.aggregate({
            where: {
              userId: user.id,
              date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
            },
            _sum: { hours: true },
          }),
    ]);

    // Build status distribution
    const statusMap: Record<string, number> = {};
    for (const s of engagementsByStatus) {
      statusMap[s.status] = s._count.id;
    }

    // Engagement type stats
    const engagementTypes = await prisma.engagement.groupBy({
      by: ['type'],
      where: engWhere,
      _count: { id: true },
    });

    const typeMap: Record<string, number> = {};
    for (const t of engagementTypes) {
      typeMap[t.type] = t._count.id;
    }

    const queryAccess = await clientQueryAccessWhere(user.id, user.role, firmId);
    const openClientQueries = queryAccess
      ? await prisma.clientAuditQuery.count({
          where: { ...queryAccess, status: 'Open' },
        })
      : 0;

    // Build response
    res.json({
      stats: {
        totalClients,
        totalEngagements,
        activeEngagements: activeEngagements.length,
        overdueDeadlines,
        teamMembers,
        monthlyHours: monthlyHours._sum.hours || 0,
        openClientQueries,
      },
      engagementsByStatus: statusMap,
      engagementsByType: typeMap,
      activeEngagements,
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        action: a.action,
        entity: a.entity,
        entityId: a.entityId,
        details: a.details,
        user: a.user,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    logger.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// GET /api/dashboard/deadlines
router.get('/deadlines', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const engWhere = engagementAccessWhere(user.id, user.role, user.firmId);
    const deadlines = await prisma.deadline.findMany({
      where: {
        engagement: engWhere,
        status: { not: 'Completed' },
      },
      orderBy: { dueDate: 'asc' },
      take: 20,
      include: {
        engagement: {
          select: { title: true, client: { select: { name: true } } },
        },
      },
    });

    const now = new Date();
    const colored = deadlines.map(d => ({
      ...d,
      isOverdue: d.dueDate < now,
      daysRemaining: Math.ceil((d.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    }));

    res.json(colored);
  } catch (err) {
    logger.error('Deadlines error:', err);
    res.status(500).json({ error: 'Failed to fetch deadlines' });
  }
});

// GET /api/dashboard/compliance-calendar — firm-wide statutory due dates (next 30 days)
router.get('/compliance-calendar', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const WINDOW_DAYS = 90;

    type StatDef =
      | { key: string; title: string; kind: 'monthly'; day: number }
      | { key: string; title: string; kind: 'quarterly'; day: number; months: number[] }
      | { key: string; title: string; kind: 'annual'; month: number; day: number };

    const STATUTORY: StatDef[] = [
      { key: 'gstr1', title: 'GSTR-1 filing', kind: 'monthly', day: 11 },
      { key: 'gstr3b', title: 'GSTR-3B payment', kind: 'monthly', day: 20 },
      { key: 'tds', title: 'TDS deposit (quarterly)', kind: 'quarterly', day: 7, months: [0, 3, 6, 9] },
      { key: 'roc', title: 'ROC annual filing window', kind: 'annual', month: 9, day: 30 },
      { key: 'itr', title: 'ITR filing (individual)', kind: 'annual', month: 6, day: 31 },
    ];

    const nextMonthly = (day: number) => {
      const d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d < today) d.setMonth(d.getMonth() + 1);
      return d;
    };

    const nextQuarterly = (day: number, months: number[]) => {
      const candidates: Date[] = [];
      for (let y = today.getFullYear(); y <= today.getFullYear() + 1; y++) {
        for (const m of months) {
          const d = new Date(y, m, day);
          if (d >= today) candidates.push(d);
        }
      }
      return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
    };

    const nextAnnual = (month: number, day: number) => {
      const d = new Date(today.getFullYear(), month, day);
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return d;
    };

    const rag = (days: number) =>
      days < 0 ? 'red' : days <= 7 ? 'red' : days <= 14 ? 'amber' : 'green';

    const allStatutory = STATUTORY.map((d) => {
      const due =
        d.kind === 'monthly'
          ? nextMonthly(d.day)
          : d.kind === 'quarterly'
            ? nextQuarterly(d.day, d.months)
            : nextAnnual(d.month, d.day);
      const daysAway = Math.ceil((due.getTime() - today.getTime()) / (24 * 3600 * 1000));
      return { key: d.key, title: d.title, dueDate: due, daysAway, rag: rag(daysAway) };
    }).sort((a, b) => a.daysAway - b.daysAway);

    const items =
      allStatutory.filter((i) => i.daysAway <= WINDOW_DAYS).length > 0
        ? allStatutory.filter((i) => i.daysAway <= WINDOW_DAYS)
        : allStatutory.slice(0, 5);

    const user = req.user!;
    const engWhere = engagementAccessWhere(user.id, user.role, user.firmId);
    const engagementDeadlines = await prisma.deadline.findMany({
      where: {
        engagement: engWhere,
        status: { not: 'Completed' },
        dueDate: { lte: new Date(Date.now() + WINDOW_DAYS * 24 * 3600 * 1000), gte: today },
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
      include: {
        engagement: {
          select: { id: true, title: true, client: { select: { name: true } } },
        },
      },
    });

    const notices = await prisma.governmentNotice.findMany({
      where: {
        client: { firmId: user.firmId! },
        dueDate: { lte: new Date(Date.now() + WINDOW_DAYS * 24 * 3600 * 1000), gte: today },
        status: { notIn: ['filed', 'closed', 'resolved'] },
      },
      orderBy: { dueDate: 'asc' },
      take: 50,
      select: {
        id: true,
        subject: true,
        portal: true,
        dueDate: true,
        status: true,
        client: { select: { name: true } },
      },
    });

    res.json({ statutory: items, engagementDeadlines, notices });
  } catch (err) {
    logger.error('Compliance calendar error:', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load compliance calendar' });
  }
});

// GET /api/dashboard/chart-data — monthly engagement trends
router.get('/chart-data', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const engWhere = engagementAccessWhere(user.id, user.role, user.firmId);
    const now = new Date();
    const months: { month: string; completed: number; active: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthLabel = start.toLocaleString('default', { month: 'short', year: '2-digit' });

      const [completed, active] = await Promise.all([
        prisma.engagement.count({
          where: { ...engWhere, status: 'Closed', updatedAt: { gte: start, lt: end } },
        }),
        prisma.engagement.count({
          where: {
            ...engWhere,
            status: { in: ['Planning', 'Fieldwork', 'Under Review', 'Reporting'] },
            createdAt: { lt: end },
          },
        }),
      ]);

      months.push({ month: monthLabel, completed, active });
    }

    res.json(months);
  } catch (err) {
    logger.error('Chart data error:', err);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

// GET /api/dashboard/briefing — admin daily briefing (Partner/Admin only)
router.get('/briefing', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!['Partner', 'Admin'].includes(req.user!.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Skip weekends for "2 business days" calculation
    let twoBizDaysAgo = new Date(now);
    let bizDays = 0;
    while (bizDays < 2) {
      twoBizDaysAgo.setDate(twoBizDaysAgo.getDate() - 1);
      const dow = twoBizDaysAgo.getDay();
      if (dow !== 0 && dow !== 6) bizDays++;
    }

    const [
      engagementsAtRisk,
      pendingDocuments,
      allEmployees,
      recentTimeLogs,
      udinPending,
      closedEngagements,
      invoicesForClosed,
    ] = await Promise.all([
      // Engagements at risk: deadline within 3 days, still in early stages
      prisma.engagement.findMany({
        where: {
          firmId,
          deadline: { lte: threeDaysLater, gte: now },
          currentStage: { in: ['Data Pending', 'Data Received', 'Execution (WIP)'] },
          status: { not: 'Closed' },
        },
        select: {
          id: true, title: true, currentStage: true, deadline: true,
          client: { select: { name: true } },
        },
      }),

      // Documents pending from clients for >5 days
      prisma.dataChecklistItem.findMany({
        where: {
          status: 'Requested',
          requestedAt: { lte: fiveDaysAgo },
          engagement: { firmId },
        },
        select: {
          id: true, title: true, requestedAt: true, followupCount: true,
          engagement: { select: { id: true, title: true, client: { select: { name: true } } } },
        },
      }),

      // All active employees
      prisma.user.findMany({
        where: { firmId, isActive: true, role: { in: ['Partner', 'Manager', 'Staff'] } },
        select: { id: true, firstName: true, lastName: true, initials: true, role: true },
      }),

      // Time log entries in last 2 business days
      prisma.timeEntry.findMany({
        where: {
          user: { firmId },
          date: { gte: twoBizDaysAgo },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),

      // UDIN pending: at Partner Review without UDIN
      prisma.engagement.findMany({
        where: {
          firmId,
          currentStage: { in: ['Partner Review', 'Client Discussion'] },
          udin: null,
          status: { not: 'Closed' },
        },
        select: {
          id: true, title: true, currentStage: true,
          client: { select: { name: true } },
        },
      }),

      // Closed engagements in last 7 days
      prisma.engagement.findMany({
        where: {
          firmId,
          currentStage: { in: ['Filed', 'Archived'] },
          filedAt: { gte: sevenDaysAgo },
        },
        select: { id: true, title: true, client: { select: { name: true } } },
      }),

      // Invoices for recently closed engagements
      prisma.invoice.findMany({
        where: {
          engagement: { firmId, filedAt: { gte: sevenDaysAgo } },
        },
        select: { engagementId: true },
      }),
    ]);

    // Employees with no time logs in last 2 business days
    const loggedUserIds = new Set(recentTimeLogs.map((t) => t.userId));
    const inactiveEmployees = allEmployees.filter((e) => !loggedUserIds.has(e.id));

    // Uninvoiced closures
    const invoicedEngIds = new Set(invoicesForClosed.map((i) => i.engagementId).filter(Boolean));
    const uninvoicedClosures = closedEngagements.filter((e) => !invoicedEngIds.has(e.id));

    res.json({
      engagementsAtRisk,
      pendingDocuments,
      inactiveEmployees,
      udinPending,
      uninvoicedClosures,
      summary: {
        atRiskCount: engagementsAtRisk.length,
        pendingDocsCount: pendingDocuments.length,
        inactiveCount: inactiveEmployees.length,
        udinPendingCount: udinPending.length,
        uninvoicedCount: uninvoicedClosures.length,
      },
    });
  } catch (err) {
    logger.error('Dashboard briefing error:', err);
    res.status(500).json({ error: 'Failed to fetch briefing' });
  }
});

// GET /api/dashboard/action-queue — prioritized client request actions (firm leadership)
router.get('/action-queue', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isFirmLeadershipRole(req.user!.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }
    const queue = await buildDashboardActionQueue(firmId);
    res.json(queue);
  } catch (err) {
    logger.error('Dashboard action queue error:', err);
    res.status(500).json({ error: 'Failed to fetch action queue' });
  }
});

export default router;
