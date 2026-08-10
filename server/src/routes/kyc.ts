import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

/** GET /api/kyc/:clientId — list KYC docs for a client */
router.get('/:clientId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docs = await prisma.kycDocument.findMany({
      where: { clientId: String(req.params.clientId), client: { firmId: req.user!.firmId! } },
      include: { verifiedBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { docType: 'asc' },
    });
    res.json(docs);
  } catch (err) {
    logger.error('List KYC error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load KYC' });
  }
});

const upsertSchema = z.object({
  docType: z.string().min(1),
  status: z.enum(['Pending', 'Received', 'Verified']).optional(),
  notes: z.string().optional(),
  fileName: z.string().optional(),
  storagePath: z.string().optional(),
});

/** POST /api/kyc/:clientId — add a new KYC item */
router.post(
  '/:clientId',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = upsertSchema.parse(req.body);
      const client = await prisma.client.findFirst({
        where: { id: String(req.params.clientId), firmId: req.user!.firmId! },
      });
      if (!client) { res.status(404).json({ error: 'Client not found' }); return; }
      const item = await prisma.kycDocument.create({
        data: { clientId: client.id, ...body, status: body.status || 'Pending' },
      });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Create KYC error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to add KYC document' });
    }
  }
);

/**
 * PATCH /api/kyc/item/:id
 * Anyone in firm can mark Pending -> Received.
 * Only Partner can mark Received -> Verified.
 */
router.patch('/item/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = upsertSchema.partial().parse(req.body);
    const existing = await prisma.kycDocument.findFirst({
      where: { id: String(req.params.id), client: { firmId: req.user!.firmId! } },
    });
    if (!existing) { res.status(404).json({ error: 'KYC item not found' }); return; }

    // Authorisation guard: Verifying requires Partner role
    if (body.status === 'Verified' && req.user!.role !== 'Partner' && req.user!.role !== 'Admin') {
      res.status(403).json({ error: 'Only Partners can verify KYC documents' });
      return;
    }

    const data: Record<string, unknown> = { ...body };
    if (body.status === 'Received' && existing.status !== 'Received') {
      data.receivedAt = new Date();
    }
    if (body.status === 'Verified' && existing.status !== 'Verified') {
      data.verifiedAt = new Date();
      data.verifiedById = req.user!.id;
    }

    const updated = await prisma.kycDocument.update({
      where: { id: existing.id },
      data,
      include: { verifiedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Update KYC error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update KYC document' });
  }
});

/** DELETE /api/kyc/item/:id — Partner only */
router.delete(
  '/item/:id',
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const existing = await prisma.kycDocument.findFirst({
        where: { id: String(req.params.id), client: { firmId: req.user!.firmId! } },
      });
      if (!existing) { res.status(404).json({ error: 'KYC item not found' }); return; }
      await prisma.kycDocument.delete({ where: { id: existing.id } });
      res.json({ ok: true });
    } catch (err) {
      logger.error('Delete KYC error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to delete KYC document' });
    }
  }
);

export default router;
