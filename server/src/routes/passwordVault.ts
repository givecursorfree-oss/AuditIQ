import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.js';
import { encryptSecret, decryptSecret, maskedDisplay } from '../lib/vaultCrypto.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const entrySchema = z.object({
  clientId: z.string().min(1),
  portalName: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  notes: z.string().optional(),
});

/** GET /api/vault?clientId= — list entries; passwords are masked */
router.get('/', requirePermission('vault', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const where: Record<string, unknown> = { client: { firmId: req.user!.firmId! } };
    if (req.query.clientId) where.clientId = String(req.query.clientId);

    const entries = await prisma.passwordVaultEntry.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ clientId: 'asc' }, { portalName: 'asc' }],
    });

    res.json(entries.map((e) => ({
      ...e,
      passwordEnc: undefined, // never expose the cipher to clients
      passwordMasked: maskedDisplay(),
    })));
  } catch (err) {
    logger.error('List vault error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load vault' });
  }
});

/** POST /api/vault — create entry */
router.post('/', requirePermission('vault', 'create'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = entrySchema.parse(req.body);
    const client = await prisma.client.findFirst({
      where: { id: body.clientId, firmId: req.user!.firmId! },
    });
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }
    const entry = await prisma.passwordVaultEntry.create({
      data: {
        clientId: body.clientId,
        portalName: body.portalName,
        username: body.username,
        passwordEnc: encryptSecret(body.password),
        notes: body.notes,
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ ...entry, passwordEnc: undefined });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Create vault entry error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create vault entry' });
  }
});

/** PATCH /api/vault/:id — update */
router.patch('/:id', requirePermission('vault', 'edit'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = entrySchema.partial().parse(req.body);
    const existing = await prisma.passwordVaultEntry.findFirst({
      where: { id: String(req.params.id), client: { firmId: req.user!.firmId! } },
    });
    if (!existing) { res.status(404).json({ error: 'Entry not found' }); return; }
    const data: Record<string, unknown> = {};
    if (body.portalName) data.portalName = body.portalName;
    if (body.username) data.username = body.username;
    if (typeof body.notes === 'string') data.notes = body.notes;
    if (body.password) data.passwordEnc = encryptSecret(body.password);

    const updated = await prisma.passwordVaultEntry.update({ where: { id: existing.id }, data });

    await prisma.vaultAccessLog.create({
      data: {
        entryId: existing.id,
        userId: req.user!.id,
        action: 'edit',
        ipAddress: req.ip,
      },
    });

    res.json({ ...updated, passwordEnc: undefined });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Update vault entry error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update vault entry' });
  }
});

/** GET /api/vault/:id/reveal — return decrypted password; ALWAYS audited */
router.get('/:id/reveal', requirePermission('vault', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const entry = await prisma.passwordVaultEntry.findFirst({
      where: { id: String(req.params.id), client: { firmId: req.user!.firmId! } },
    });
    if (!entry) { res.status(404).json({ error: 'Entry not found' }); return; }

    let plaintext: string;
    try {
      plaintext = decryptSecret(entry.passwordEnc);
    } catch (err) {
      logger.error('Vault decryption failure', { entryId: entry.id, error: (err as Error).message });
      res.status(500).json({ error: 'Failed to decrypt — vault key may be incorrect' });
      return;
    }

    await prisma.vaultAccessLog.create({
      data: {
        entryId: entry.id,
        userId: req.user!.id,
        action: 'reveal',
        ipAddress: req.ip,
      },
    });

    res.json({ id: entry.id, password: plaintext });
  } catch (err) {
    logger.error('Reveal vault error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to reveal password' });
  }
});

/** DELETE /api/vault/:id — Partner only */
router.delete('/:id', requirePermission('vault', 'delete'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const entry = await prisma.passwordVaultEntry.findFirst({
      where: { id: String(req.params.id), client: { firmId: req.user!.firmId! } },
    });
    if (!entry) { res.status(404).json({ error: 'Entry not found' }); return; }
    await prisma.vaultAccessLog.create({
      data: { entryId: entry.id, userId: req.user!.id, action: 'delete', ipAddress: req.ip },
    });
    await prisma.passwordVaultEntry.delete({ where: { id: entry.id } });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete vault entry error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete vault entry' });
  }
});

/** GET /api/vault/audit-log?entryId=&userId= */
router.get('/audit-log/all', requirePermission('vault', 'view'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'Partner' && req.user!.role !== 'Admin') {
      res.status(403).json({ error: 'Only Partners can view vault audit logs' });
      return;
    }
    const where: Record<string, unknown> = { entry: { client: { firmId: req.user!.firmId! } } };
    if (req.query.entryId) where.entryId = String(req.query.entryId);
    if (req.query.userId) where.userId = String(req.query.userId);

    const logs = await prisma.vaultAccessLog.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        entry: { select: { id: true, portalName: true, client: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json(logs);
  } catch (err) {
    logger.error('Vault audit log error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load audit log' });
  }
});

export default router;
