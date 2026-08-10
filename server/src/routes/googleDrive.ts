import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { getEnv } from '../lib/env.js';
import logger from '../lib/logger.js';
import { createGoogleOAuthState, verifyGoogleOAuthState } from '../lib/googleOAuthState.js';
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  listDriveFolders,
  parseSyncFolders,
  serializeSyncFolders,
  syncGoogleDriveConnection,
} from '../lib/driveSync.js';

const router = Router();

const DRIVE_MANAGERS = ['Partner', 'Admin', 'Manager'] as const;

function isDriveConfigured(): boolean {
  const env = getEnv();
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

// GET /api/integrations/google-drive/status
router.get('/status', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const conn = await prisma.googleDriveConnection.findUnique({
      where: { userId: req.user!.id },
      select: {
        id: true,
        googleEmail: true,
        folderIds: true,
        defaultEngagementId: true,
        lastSyncAt: true,
        isActive: true,
      },
    });

    const folders = parseSyncFolders(conn?.folderIds);

    res.json({
      configured: isDriveConfigured(),
      connected: !!conn?.isActive,
      googleEmail: conn?.googleEmail ?? null,
      folderIds: folders.map((f) => f.id),
      folders,
      defaultEngagementId: conn?.defaultEngagementId ?? null,
      lastSyncAt: conn?.lastSyncAt ?? null,
    });
  } catch (err) {
    logger.error('Drive status error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get Drive status' });
  }
});

// GET /api/integrations/google-drive/auth-url
router.get(
  '/auth-url',
  authenticate,
  authorize(...DRIVE_MANAGERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!isDriveConfigured()) {
        res.status(503).json({ error: 'Google Drive OAuth is not configured on the server' });
        return;
      }
      if (!req.user?.firmId) {
        res.status(400).json({ error: 'User must belong to a firm' });
        return;
      }
      const state = createGoogleOAuthState(req.user.id, req.user.firmId);
      res.json({ url: buildGoogleAuthUrl(state), state });
    } catch (err) {
      logger.error('Drive auth-url error', { error: (err as Error).message });
      res.status(500).json({ error: 'Google Drive connection failed' });
    }
  }
);

// GET /api/integrations/google-drive/callback?code=&state=
router.get('/callback', async (req, res: Response): Promise<void> => {
  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const pending = verifyGoogleOAuthState(state);
    if (!code || !pending) {
      res.redirect(`${getEnv().CLIENT_URL}/documents?drive=error`);
      return;
    }
    await exchangeGoogleCode(code, pending.userId, pending.firmId);
    res.redirect(`${getEnv().CLIENT_URL}/documents?drive=connected`);
  } catch (err) {
    logger.error('Drive OAuth callback failed', { error: (err as Error).message });
    res.redirect(`${getEnv().CLIENT_URL}/documents?drive=error`);
  }
});

const settingsSchema = z.object({
  folders: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1) }))
    .optional(),
  folderIds: z.array(z.string()).optional(),
  defaultEngagementId: z.string().uuid().nullable().optional(),
});

// GET /api/integrations/google-drive/folders?parent=root
router.get(
  '/folders',
  authenticate,
  authorize(...DRIVE_MANAGERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parent = String(req.query.parent || 'root');
      const folders = await listDriveFolders(req.user!.id, parent);
      res.json({ folders, parent });
    } catch (err) {
      const msg = (err as Error).message;
      logger.error('Drive folders error', { error: msg });
      if (msg.includes('not connected')) {
        res.status(404).json({ error: 'Google Drive not connected' });
      } else {
        res.status(500).json({ error: 'Google Drive connection failed' });
      }
    }
  }
);

// PATCH /api/integrations/google-drive/settings
router.patch(
  '/settings',
  authenticate,
  authorize(...DRIVE_MANAGERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = settingsSchema.parse(req.body);
      const conn = await prisma.googleDriveConnection.findUnique({
        where: { userId: req.user!.id },
      });
      if (!conn) {
        res.status(404).json({ error: 'Connect Google Drive first' });
        return;
      }

      if (data.defaultEngagementId) {
        const eng = await prisma.engagement.findFirst({
          where: { id: data.defaultEngagementId, firmId: conn.firmId },
        });
        if (!eng) {
          res.status(400).json({ error: 'Invalid engagement' });
          return;
        }
      }

      let syncFolders = data.folders;
      if (!syncFolders && data.folderIds) {
        syncFolders = data.folderIds.map((id) => ({ id, name: id }));
      }

      const updateData: {
        folderIds?: string;
        defaultEngagementId?: string | null;
      } = {};

      if (syncFolders !== undefined) {
        updateData.folderIds = serializeSyncFolders(syncFolders);
      }
      if (data.defaultEngagementId !== undefined) {
        updateData.defaultEngagementId = data.defaultEngagementId;
      }

      const updated = await prisma.googleDriveConnection.update({
        where: { userId: req.user!.id },
        data: updateData,
      });

      const folders = parseSyncFolders(updated.folderIds);

      res.json({
        folderIds: folders.map((f) => f.id),
        folders,
        defaultEngagementId: updated.defaultEngagementId,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      res.status(500).json({ error: 'Failed to update settings' });
    }
  }
);

// POST /api/integrations/google-drive/sync
router.post(
  '/sync',
  authenticate,
  authorize(...DRIVE_MANAGERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const conn = await prisma.googleDriveConnection.findUnique({
        where: { userId: req.user!.id },
      });
      if (!conn?.isActive) {
        res.status(404).json({ error: 'Google Drive not connected' });
        return;
      }
      const result = await syncGoogleDriveConnection(conn.id);
      res.json(result);
    } catch (err) {
      const msg = (err as Error).message;
      logger.error('Manual drive sync failed', { error: msg });
      if (msg.includes('already in progress')) {
        res.status(409).json({ error: 'A sync is already in progress' });
      } else {
        res.status(500).json({ error: 'Google Drive connection failed' });
      }
    }
  }
);

// DELETE /api/integrations/google-drive
router.delete(
  '/',
  authenticate,
  authorize(...DRIVE_MANAGERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await prisma.googleDriveConnection.deleteMany({
        where: { userId: req.user!.id },
      });
      res.json({ message: 'Disconnected' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  }
);

export default router;
