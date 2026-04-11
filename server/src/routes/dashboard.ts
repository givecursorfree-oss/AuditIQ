import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/dashboard
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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
      // Total clients
      prisma.client.count({ where: { firmId, isActive: true } }),

      // Total engagements
      prisma.engagement.count({ where: { firmId } }),

      // Engagements by status
      prisma.engagement.groupBy({
        by: ['status'],
        where: { firmId },
        _count: { id: true },
      }),

      // Active engagements detail
      prisma.engagement.findMany({
        where: { firmId, status: { in: ['Planning', 'Fieldwork', 'Under Review'] } },
        take: 10,
        orderBy: { updatedAt: 'desc' },
        include: {
          client: { select: { name: true } },
          members: {
            include: { user: { select: { firstName: true, lastName: true, initials: true } } },
          },
          _count: { select: { workpapers: true, observations: true } },
        },
      }),

      // Overdue deadlines
      prisma.deadline.count({
        where: {
          engagement: { firmId },
          dueDate: { lt: now },
          status: { not: 'Completed' },
        },
      }),

      // Recent audit log activity
      prisma.auditLog.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true, initials: true } },
        },
      }),

      // Team members count
      prisma.user.count({ where: { firmId, isActive: true } }),

      // Total hours this month
      prisma.timeEntry.aggregate({
        where: {
          user: { firmId },
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
      where: { firmId },
      _count: { id: true },
    });

    const typeMap: Record<string, number> = {};
    for (const t of engagementTypes) {
      typeMap[t.type] = t._count.id;
    }

    // Build response
    res.json({
      stats: {
        totalClients,
        totalEngagements,
        activeEngagements: activeEngagements.length,
        overdueDeadlines,
        teamMembers,
        monthlyHours: monthlyHours._sum.hours || 0,
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
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// GET /api/dashboard/deadlines
router.get('/deadlines', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    const deadlines = await prisma.deadline.findMany({
      where: {
        engagement: { firmId },
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
    console.error('Deadlines error:', err);
    res.status(500).json({ error: 'Failed to fetch deadlines' });
  }
});

// GET /api/dashboard/chart-data — monthly engagement trends
router.get('/chart-data', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    const now = new Date();
    const months: { month: string; completed: number; active: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthLabel = start.toLocaleString('default', { month: 'short', year: '2-digit' });

      const [completed, active] = await Promise.all([
        prisma.engagement.count({
          where: { firmId, status: 'Closed', updatedAt: { gte: start, lt: end } },
        }),
        prisma.engagement.count({
          where: { firmId, status: { in: ['Planning', 'Fieldwork', 'Under Review', 'Reporting'] }, createdAt: { lt: end } },
        }),
      ]);

      months.push({ month: monthLabel, completed, active });
    }

    res.json(months);
  } catch (err) {
    console.error('Chart data error:', err);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

export default router;
