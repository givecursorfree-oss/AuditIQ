import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

// GET /api/audit-log — list audit log entries (Admin/Partner only)
router.get('/', authorize('Admin', 'Partner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }
    const { entity, action, userId, page = '1', limit = '50' } = req.query;
    const where: Record<string, unknown> = { user: { firmId } };
    if (entity) where.entity = String(entity);
    if (action) where.action = String(action);
    if (userId) where.userId = String(userId);

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
        include: {
          user: { select: { firstName: true, lastName: true, initials: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ logs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    logger.error('List audit logs error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// GET /api/audit-log/stats — aggregated stats
router.get('/stats', authorize('Admin', 'Partner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const firmScope = { user: { firmId } };

    const [todayCount, weekCount, totalCount, byAction] = await Promise.all([
      prisma.auditLog.count({ where: { ...firmScope, createdAt: { gte: today } } }),
      prisma.auditLog.count({ where: { ...firmScope, createdAt: { gte: weekAgo } } }),
      prisma.auditLog.count({ where: firmScope }),
      prisma.auditLog.groupBy({ by: ['action'], where: firmScope, _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
    ]);

    res.json({
      todayCount,
      weekCount,
      totalCount,
      byAction: byAction.map(a => ({ action: a.action, count: a._count.id })),
    });
  } catch (err) {
    logger.error('Audit log stats error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch audit log stats' });
  }
});

export default router;
