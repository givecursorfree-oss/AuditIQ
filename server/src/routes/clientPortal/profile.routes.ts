import { Router, Response } from 'express';
import { prisma } from '../../index.js';
import logger from '../../lib/logger.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { getClientPortalScope } from './shared.js';

const router = Router();

// GET /api/client/me — client profile for dashboard header
router.get('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const client = await prisma.client.findUnique({
      where: { id: scope.clientId },
      select: {
        id: true,
        name: true,
        legalName: true,
        contactName: true,
        contactEmail: true,
        status: true,
        firm: { select: { name: true } },
      },
    });

    res.json({
      clientId: scope.clientId,
      clientName: client?.name ?? scope.clientName,
      legalName: client?.legalName,
      firmName: client?.firm?.name,
      contactName: client?.contactName,
    });
  } catch (err) {
    logger.error('Client portal - me error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// GET /api/client/preferences — notification preferences
router.get('/preferences', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        notifyStageChanges: true,
        notifyDocumentRequests: true,
        notifyInvoices: true,
      },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err) {
    logger.error('Client portal - preferences get error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load preferences' });
  }
});

// PATCH /api/client/preferences
router.patch('/preferences', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data: Record<string, boolean> = {};
    if (typeof req.body.notifyStageChanges === 'boolean') {
      data.notifyStageChanges = req.body.notifyStageChanges;
    }
    if (typeof req.body.notifyDocumentRequests === 'boolean') {
      data.notifyDocumentRequests = req.body.notifyDocumentRequests;
    }
    if (typeof req.body.notifyInvoices === 'boolean') {
      data.notifyInvoices = req.body.notifyInvoices;
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: {
        notifyStageChanges: true,
        notifyDocumentRequests: true,
        notifyInvoices: true,
      },
    });
    res.json(user);
  } catch (err) {
    logger.error('Client portal - preferences patch error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
