import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logClaimAudit } from '../lib/claimAudit.js';

const router = Router();
router.use(authenticate);

const batchInclude = {
  createdBy: { select: { firstName: true, lastName: true } },
  partnerApprovedBy: { select: { firstName: true, lastName: true } },
  claims: {
    include: {
      staff: { select: { firstName: true, lastName: true } },
      client: { select: { name: true } },
      engagement: { select: { title: true } },
      receipts: { select: { id: true, fileName: true } },
    },
  },
};

function batchTotal(claims: { approvedAmount: { toString(): string } | null; amount: { toString(): string } }[]): number {
  return claims.reduce((s, c) => s + Number(c.approvedAmount ?? c.amount), 0);
}

/** POST /api/claim-batches — group manager-approved claims */
router.post('/', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response) => {
  const body = z.object({
    label: z.string().min(1),
    claimIds: z.array(z.string()).min(1),
  }).parse(req.body);
  const firmId = req.user!.firmId!;
  const claims = await prisma.expenseClaim.findMany({
    where: {
      id: { in: body.claimIds },
      firmId,
      claimStatus: { in: ['approved', 'partially_approved'] },
      processingStatus: 'unprocessed',
    },
  });
  if (claims.length !== body.claimIds.length) {
    res.status(400).json({ error: 'Some claims are not eligible for batching' });
    return;
  }
  const types = new Set(claims.map((c) => c.claimType));
  const batchType = types.size === 1 ? [...types][0]! : 'mixed';
  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.claimBatch.create({
      data: { firmId, label: body.label, batchType, createdById: req.user!.id, status: 'draft' },
    });
    await tx.expenseClaim.updateMany({
      where: { id: { in: body.claimIds } },
      data: { batchId: b.id, processingStatus: 'in_batch' },
    });
    for (const id of body.claimIds) {
      await tx.claimAuditEvent.create({
        data: { claimId: id, batchId: b.id, actorId: req.user!.id, action: 'batch_created', details: { batchId: b.id } },
      });
    }
    return b;
  });
  const full = await prisma.claimBatch.findUnique({ where: { id: batch.id }, include: batchInclude });
  res.status(201).json(full);
});

router.get('/', authorize('Partner', 'Admin', 'Manager', 'Accounts'), async (req: AuthRequest, res: Response) => {
  const batches = await prisma.claimBatch.findMany({
    where: { firmId: req.user!.firmId! },
    include: batchInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    batches: batches.map((b) => ({
      ...b,
      claimCount: b.claims.length,
      totalAmount: batchTotal(b.claims),
    })),
  });
});

router.get('/:id', authorize('Partner', 'Admin', 'Manager', 'Accounts'), async (req: AuthRequest, res: Response) => {
  const batch = await prisma.claimBatch.findFirst({
    where: { id: String(req.params.id), firmId: req.user!.firmId! },
    include: batchInclude,
  });
  if (!batch) {
    res.status(404).json({ error: 'Batch not found' });
    return;
  }
  res.json({ ...batch, totalAmount: batchTotal(batch.claims) });
});

router.patch('/:id/partner-approve', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response) => {
  const batch = await prisma.claimBatch.findFirst({ where: { id: String(req.params.id), firmId: req.user!.firmId! } });
  if (!batch || batch.status !== 'draft') {
    res.status(400).json({ error: 'Batch not ready' });
    return;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.claimBatch.update({
      where: { id: batch.id },
      data: {
        status: 'partner_approved',
        partnerApprovedById: req.user!.id,
        partnerApprovedAt: new Date(),
      },
    });
    await tx.expenseClaim.updateMany({
      where: { batchId: batch.id },
      data: { processingStatus: 'partner_approved' },
    });
    return b;
  });
  res.json(updated);
});

router.patch('/:id/accounts-approve', authorize('Partner', 'Admin', 'Accounts'), async (req: AuthRequest, res: Response) => {
  const batch = await prisma.claimBatch.findFirst({ where: { id: String(req.params.id), firmId: req.user!.firmId! } });
  if (!batch || batch.status !== 'partner_approved') {
    res.status(400).json({ error: 'Batch not partner-approved' });
    return;
  }
  const updated = await prisma.claimBatch.update({
    where: { id: batch.id },
    data: { status: 'accounts_approved', accountsApprovedAt: new Date() },
  });
  await prisma.expenseClaim.updateMany({
    where: { batchId: batch.id },
    data: { processingStatus: 'accounts_approved' },
  });
  res.json(updated);
});

router.patch('/:id/mark-paid', authorize('Partner', 'Admin', 'Accounts'), async (req: AuthRequest, res: Response) => {
  const body = z.object({ paymentRef: z.string().min(1) }).parse(req.body);
  const batch = await prisma.claimBatch.findFirst({ where: { id: String(req.params.id), firmId: req.user!.firmId! } });
  if (!batch || batch.status !== 'accounts_approved') {
    res.status(400).json({ error: 'Batch not accounts-approved' });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.claimBatch.update({
      where: { id: batch.id },
      data: { status: 'paid', paidAt: new Date() },
    });
    const claims = await tx.expenseClaim.findMany({ where: { batchId: batch.id } });
    for (const c of claims) {
      await tx.expenseClaim.update({
        where: { id: c.id },
        data: {
          processingStatus: 'paid',
          paidAt: new Date(),
          paidById: req.user!.id,
          paymentRef: body.paymentRef,
        },
      });
      await logClaimAudit(c.id, 'paid', req.user!.id, { paymentRef: body.paymentRef, batchId: batch.id });
    }
  });
  res.json({ ok: true });
});

/** GET /api/claim-batches/:id/export.csv — reimbursement-style export */
router.get('/:id/export.csv', authorize('Partner', 'Admin', 'Manager', 'Accounts'), async (req: AuthRequest, res: Response) => {
  const batch = await prisma.claimBatch.findFirst({
    where: { id: String(req.params.id), firmId: req.user!.firmId! },
    include: {
      claims: {
        include: {
          staff: { select: { firstName: true, lastName: true } },
          expensePayer: { select: { firstName: true, lastName: true } },
          client: { select: { name: true } },
          engagement: { select: { title: true } },
          participants: {
            include: {
              user: { select: { firstName: true, lastName: true } },
              engagement: { select: { title: true } },
            },
          },
        },
      },
    },
  });
  if (!batch) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const lines: string[] = ['DETAILS OF REIMBURSEMENT', `Batch,${batch.label}`, ''];
  lines.push('PAID BY');
  lines.push('Name,Amount');
  for (const c of batch.claims) {
    const payer = c.expensePayer ?? c.staff;
    const paid = Number(c.approvedAmount ?? c.amount);
    lines.push(`"${payer.firstName} ${payer.lastName}",${paid}`);
  }
  lines.push('');
  lines.push('PEOPLE COVERED');
  lines.push('Name,Engagement,Share');
  for (const c of batch.claims) {
    const parts = c.participants.length ? c.participants : [];
    if (parts.length === 0) {
      lines.push(`"${c.staff.firstName} ${c.staff.lastName}","${c.engagement?.title ?? ''}",${c.approvedAmount ?? c.amount}`);
    } else {
      for (const p of parts) {
        lines.push(`"${p.user.firstName} ${p.user.lastName}","${p.engagement?.title ?? ''}",${p.amountShare}`);
      }
    }
  }
  lines.push('');
  lines.push(`Total Amount of Expenses,${batchTotal(batch.claims)}`);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="claim-batch-${batch.id.slice(0, 8)}.csv"`);
  res.send(lines.join('\n'));
});

export default router;
