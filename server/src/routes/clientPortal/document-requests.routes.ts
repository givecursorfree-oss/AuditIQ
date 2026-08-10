import { Router, Response } from 'express';
import { prisma } from '../../index.js';
import logger from '../../lib/logger.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { getClientPortalScope } from './shared.js';

const router = Router();

router.get('/document-requests', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const requests = await prisma.documentRequest.findMany({
      where: { engagement: { clientId: scope.clientId } },
      orderBy: { createdAt: 'desc' },
      include: {
        engagement: { select: { id: true, title: true } },
      },
    });

    res.json(
      requests.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        dueDate: r.dueDate?.toISOString() ?? null,
        clientNotes: r.clientNotes,
        engagementId: r.engagement.id,
        engagementName: r.engagement.title,
        createdAt: r.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error('Client portal - list document requests error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch document requests' });
  }
});

router.patch('/document-requests/:id/notes', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const { notes } = req.body;
    const existing = await prisma.documentRequest.findFirst({
      where: {
        id: String(req.params.id),
        engagement: { clientId: scope.clientId },
      },
    });
    if (!existing) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    const request = await prisma.documentRequest.update({
      where: { id: existing.id },
      data: { clientNotes: String(notes ?? '') },
    });
    res.json(request);
  } catch (err) {
    logger.error('Client portal - update document request notes error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

export default router;
