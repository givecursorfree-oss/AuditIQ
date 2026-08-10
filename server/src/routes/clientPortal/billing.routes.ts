import { Router, Response } from 'express';
import { prisma } from '../../index.js';
import logger from '../../lib/logger.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { getClientPortalScope } from './shared.js';

const router = Router();

// GET /api/client/invoices — all invoices for this client
router.get('/invoices', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const invoices = await prisma.invoice.findMany({
      where: { clientId: scope.clientId },
      orderBy: { issueDate: 'desc' },
      include: { engagement: { select: { id: true, title: true } } },
    });

    const now = new Date();
    res.json(
      invoices.map((inv) => ({
        id: inv.id,
        number: inv.invoiceNo,
        amount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        balance: inv.totalAmount - inv.paidAmount,
        status:
          inv.status === 'Unpaid' && inv.dueDate < now ? 'Overdue' : inv.status,
        dueDate: inv.dueDate.toISOString(),
        issueDate: inv.issueDate.toISOString(),
        engagementId: inv.engagementId,
        engagementName: inv.engagement?.title ?? null,
      }))
    );
  } catch (err) {
    logger.error('Client portal - invoices error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load invoices' });
  }
});

export default router;
