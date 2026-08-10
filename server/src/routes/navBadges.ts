import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { computeNavBadgesForUser } from '../lib/navBadgeCounts.js';
import { ackNavAttention, type NavAttentionScope } from '../lib/navAttentionAck.js';

const router = Router();
router.use(authenticate);

const ackSchema = z.object({
  scopes: z.array(z.string()).min(1),
});

/** GET /api/nav-badges — aggregate attention counts for sidebar and dashboards */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const badges = await computeNavBadgesForUser({
      id: user.id,
      role: user.role,
      email: user.email,
      firmId: user.firmId,
    });
    res.json({ badges });
  } catch (err) {
    logger.error('Nav badges error:', err);
    res.status(500).json({ error: 'Failed to fetch nav badges' });
  }
});

/** POST /api/nav-badges/ack — mark nav areas as seen; badges clear until new activity */
router.post('/ack', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = ackSchema.parse(req.body ?? {});
    const scopes = body.scopes as NavAttentionScope[];
    await ackNavAttention(req.user!.id, scopes);
    const badges = await computeNavBadgesForUser({
      id: req.user!.id,
      role: req.user!.role,
      email: req.user!.email,
      firmId: req.user!.firmId,
    });
    res.json({ badges });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Nav badges ack error:', err);
    res.status(500).json({ error: 'Failed to acknowledge nav attention' });
  }
});

export default router;
