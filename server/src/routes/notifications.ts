import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

// GET /api/notifications
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch (err) {
    logger.error('List notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, isRead: false },
    });
    res.json({ count });
  } catch (err) {
    logger.error('Unread count error:', err);
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notification = await prisma.notification.updateMany({
      where: { id: String(req.params.id), userId: req.user!.id },
      data: { isRead: true },
    });
    if (notification.count === 0) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    const updated = await prisma.notification.findUnique({ where: { id: String(req.params.id) } });
    res.json(updated);
  } catch (err) {
    logger.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// POST /api/notifications/mark-all-read
router.post('/mark-all-read', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    logger.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

export default router;
