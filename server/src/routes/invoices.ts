import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  invoiceNo: z.string().min(1),
  clientId: z.string().min(1),
  engagementId: z.string().optional(),
  amount: z.number().nonnegative(),
  tax: z.number().nonnegative().default(0),
  description: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string(),
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  paidAt: z.string().optional(),
});

/** GET /api/invoices — list */
router.get('/', requirePermission('invoices', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const where: Record<string, unknown> = { client: { firmId: req.user!.firmId! } };
    if (req.query.clientId) where.clientId = String(req.query.clientId);
    if (req.query.status) where.status = String(req.query.status);

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        engagement: { select: { id: true, title: true } },
        payments: true,
      },
      orderBy: { issueDate: 'desc' },
    });

    // Mark overdue invoices for display (DB state is updated lazily here)
    const now = new Date();
    const enriched = invoices.map((inv) => {
      const overdue = inv.status === 'Unpaid' && inv.dueDate < now;
      return { ...inv, displayStatus: overdue ? 'Overdue' : inv.status };
    });

    res.json(enriched);
  } catch (err) {
    logger.error('List invoices error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load invoices' });
  }
});

/** POST /api/invoices */
router.post(
  '/',
  requirePermission('invoices', 'create'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = createSchema.parse(req.body);
      const client = await prisma.client.findFirst({
        where: { id: body.clientId, firmId: req.user!.firmId! },
      });
      if (!client) { res.status(404).json({ error: 'Client not found' }); return; }
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNo: body.invoiceNo,
          clientId: body.clientId,
          engagementId: body.engagementId,
          amount: body.amount,
          tax: body.tax,
          totalAmount: body.amount + body.tax,
          description: body.description,
          issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
          dueDate: new Date(body.dueDate),
          createdById: req.user!.id,
        },
      });
      res.status(201).json(invoice);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      if ((err as { code?: string }).code === 'P2002') {
        res.status(409).json({ error: 'Invoice number already exists' });
        return;
      }
      logger.error('Create invoice error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  }
);

/** POST /api/invoices/:id/payments — record payment, update invoice status */
router.post(
  '/:id/payments',
  requirePermission('invoices', 'approve'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = paymentSchema.parse(req.body);
      const invoice = await prisma.invoice.findFirst({
        where: { id: String(req.params.id), client: { firmId: req.user!.firmId! } },
        include: { payments: true },
      });
      if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }

      const result = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: body.amount,
            method: body.method,
            reference: body.reference,
            notes: body.notes,
            paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
          },
        });
        const newPaid = invoice.paidAmount + body.amount;
        const status =
          newPaid >= invoice.totalAmount ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid';
        const updated = await tx.invoice.update({
          where: { id: invoice.id },
          data: { paidAmount: newPaid, status },
        });
        return { payment, invoice: updated };
      });

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Record payment error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to record payment' });
    }
  }
);

/** GET /api/invoices/outstanding — summary of receivables (Partner view) */
router.get(
  '/outstanding/summary',
  requirePermission('invoices', 'view'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const invoices = await prisma.invoice.findMany({
        where: {
          client: { firmId: req.user!.firmId! },
          status: { in: ['Unpaid', 'Partial', 'Overdue'] },
        },
        include: { client: { select: { id: true, name: true } } },
      });
      const total = invoices.reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);
      const byClient = new Map<string, { clientId: string; clientName: string; outstanding: number; count: number }>();
      for (const i of invoices) {
        const row = byClient.get(i.clientId) || {
          clientId: i.clientId,
          clientName: i.client.name,
          outstanding: 0,
          count: 0,
        };
        row.outstanding += i.totalAmount - i.paidAmount;
        row.count += 1;
        byClient.set(i.clientId, row);
      }
      res.json({ totalOutstanding: total, perClient: Array.from(byClient.values()) });
    } catch (err) {
      logger.error('Outstanding summary error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to compute summary' });
    }
  }
);

/** POST /api/invoices/from-engagement/:engagementId — draft invoice from engagement billing / time */
router.post(
  '/from-engagement/:engagementId',
  requirePermission('invoices', 'create'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const engagement = await prisma.engagement.findFirst({
        where: { id: String(req.params.engagementId), firmId: req.user!.firmId! },
        include: {
          client: true,
          timeEntries: { where: { isBillable: true } },
        },
      });
      if (!engagement) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }

      const billableHours = engagement.timeEntries.reduce((s, t) => s + t.hours, 0);
      let amount = engagement.billingAmount ?? 0;
      if (!amount && billableHours > 0) {
        const rate = 2500;
        amount = Math.round(billableHours * rate);
      }
      if (amount <= 0) {
        res.status(400).json({
          error: 'Set billing amount on engagement or log billable time before invoicing',
        });
        return;
      }

      const tax = Math.round(amount * 0.18);
      const due = new Date();
      due.setDate(due.getDate() + 30);
      const invoiceNo = `INV-${engagement.financialYear.replace(/\s/g, '')}-${Date.now().toString().slice(-6)}`;

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNo,
          clientId: engagement.clientId,
          engagementId: engagement.id,
          amount,
          tax,
          totalAmount: amount + tax,
          description: `Professional fees — ${engagement.title} (${engagement.type}, FY ${engagement.financialYear})`,
          dueDate: due,
          createdById: req.user!.id,
        },
        include: {
          client: { select: { id: true, name: true } },
          engagement: { select: { id: true, title: true } },
        },
      });

      res.status(201).json(invoice);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        res.status(409).json({ error: 'Invoice number collision — retry' });
        return;
      }
      logger.error('Draft invoice from engagement error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  }
);

export default router;
