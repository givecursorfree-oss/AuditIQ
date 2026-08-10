import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { portalSyncService } from '../lib/portalSync.js';
import { loadPortalCredentials } from '../lib/portalCredentials.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

/** POST /api/portals/login — Playwright auto-login using vault credentials */
router.post('/login', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = z
      .object({
        portal: z.enum(['GST', 'Income_Tax', 'TRACES']),
        clientId: z.string(),
        vaultEntryId: z.string().optional(),
      })
      .parse(req.body);

    const firmId = req.user!.firmId!;
    const client = await prisma.client.findFirst({
      where: { id: body.clientId, firmId },
      select: { id: true },
    });
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    let credentials = await loadPortalCredentials(firmId, body.clientId, body.portal);
    if (!credentials && body.vaultEntryId) {
      const entry = await prisma.passwordVaultEntry.findFirst({
        where: { id: body.vaultEntryId, clientId: body.clientId, client: { firmId } },
        include: { client: { select: { gstin: true, pan: true } } },
      });
      if (entry) {
        const { decryptSecret } = await import('../lib/vaultCrypto.js');
        credentials = {
          portal: body.portal,
          clientId: body.clientId,
          username: entry.username,
          password: decryptSecret(entry.passwordEnc),
          gstin: entry.client.gstin ?? undefined,
          pan: entry.client.pan ?? undefined,
          vaultEntryId: entry.id,
        };
      }
    }

    if (!credentials) {
      res.status(404).json({ error: 'No vault credentials found for this client and portal' });
      return;
    }

    const result = await portalSyncService.autoLogin(body.portal, credentials);

    if (credentials.vaultEntryId && result.status === 'logged_in') {
      await prisma.passwordVaultEntry.update({
        where: { id: credentials.vaultEntryId },
        data: { lastSyncedAt: new Date() },
      }).catch(() => undefined);

      await prisma.vaultAccessLog.create({
        data: {
          entryId: credentials.vaultEntryId,
          userId: req.user!.id,
          action: 'portal_auto_login',
        },
      }).catch((err) => {
        logger.warn('Vault audit log skipped for portal login', { error: (err as Error).message });
      });
    }

    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Portal login error', { error: (err as Error).message });
    res.status(500).json({ error: 'Portal login failed' });
  }
});

export default router;
