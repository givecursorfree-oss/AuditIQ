import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const PRESENCE_STATUSES = ['online', 'offline', 'maintenance', 'degraded'] as const;
const STAFF_ROLES = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'] as const;

const updateSchema = z.object({
  status: z.enum(PRESENCE_STATUSES),
});

// PATCH /api/presence/me — update current user's presence
router.patch('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user!.role;
    if (!STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])) {
      res.status(403).json({ error: 'Only firm staff can update presence status' });
      return;
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        presenceStatus: parsed.data.status,
        presenceUpdatedAt: new Date(),
      },
      select: {
        id: true,
        presenceStatus: true,
        presenceUpdatedAt: true,
      },
    });

    res.json(user);
  } catch (err) {
    logger.error('Update presence error:', err);
    res.status(500).json({ error: 'Failed to update presence' });
  }
});

// GET /api/presence — firm staff presence map (for avatars / team views)
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.json([]);
      return;
    }

    const staff = await prisma.user.findMany({
      where: {
        firmId,
        isActive: true,
        role: { in: [...STAFF_ROLES] },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        initials: true,
        role: true,
        designation: true,
        presenceStatus: true,
        presenceUpdatedAt: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    res.json(staff);
  } catch (err) {
    logger.error('List presence error:', err);
    res.status(500).json({ error: 'Failed to fetch presence' });
  }
});

export default router;
