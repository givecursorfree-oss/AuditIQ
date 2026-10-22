import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import {
  createSharedDriveFolder,
  getSharedDriveFolderMeta,
  mapDriveApiError,
  parseGoogleDriveFolderId,
} from '../lib/driveSync.js';

const router = Router({ mergeParams: true });

const DRIVE_MANAGERS = ['Partner', 'Admin', 'Manager'] as const;

async function loadEngagementForFirm(engagementId: string, firmId: string) {
  return prisma.engagement.findFirst({
    where: { id: engagementId, firmId, archivedAt: null },
    select: { id: true, title: true, firmId: true },
  });
}

function serializeLink(row: {
  id: string;
  folderId: string;
  driveId: string;
  name: string;
  isPrimary: boolean;
  webViewLink: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    folderId: row.folderId,
    driveId: row.driveId,
    name: row.name,
    isPrimary: row.isPrimary,
    webViewLink: row.webViewLink || `https://drive.google.com/drive/folders/${row.folderId}`,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /api/engagements/:id/drive-folders
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engagementId = String(req.params.id);
    const eng = await loadEngagementForFirm(engagementId, req.user!.firmId!);
    if (!eng) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    const rows = await prisma.engagementDriveFolder.findMany({
      where: { engagementId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({
      folders: rows.map(serializeLink),
      primary: rows.find((r) => r.isPrimary) ? serializeLink(rows.find((r) => r.isPrimary)!) : null,
    });
  } catch (err) {
    logger.error('List engagement drive folders error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list Drive folders' });
  }
});

const linkSchema = z
  .object({
    folderId: z.string().min(1).optional(),
    folderUrl: z.string().min(1).optional(),
    isPrimary: z.boolean().optional(),
  })
  .refine((b) => Boolean(b.folderId?.trim() || b.folderUrl?.trim()), {
    message: 'folderId or folderUrl is required',
  });

// POST /api/engagements/:id/drive-folders — link existing Shared Drive folder
router.post(
  '/',
  authenticate,
  authorize(...DRIVE_MANAGERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const engagementId = String(req.params.id);
      const eng = await loadEngagementForFirm(engagementId, req.user!.firmId!);
      if (!eng) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }
      const body = linkSchema.parse(req.body);
      const folderId =
        parseGoogleDriveFolderId(body.folderId || body.folderUrl || '') ||
        body.folderId?.trim() ||
        null;
      if (!folderId) {
        res.status(400).json({
          error: 'Could not read a Drive folder id from the URL. Paste a Shared Drive folder link or id.',
        });
        return;
      }
      const meta = await getSharedDriveFolderMeta(req.user!.id, folderId);

      const existingCount = await prisma.engagementDriveFolder.count({ where: { engagementId } });
      const makePrimary =
        body.isPrimary === true || (existingCount === 0 && body.isPrimary !== false);

      const row = await prisma.$transaction(async (tx) => {
        if (makePrimary) {
          await tx.engagementDriveFolder.updateMany({
            where: { engagementId, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        return tx.engagementDriveFolder.upsert({
          where: {
            engagementId_folderId: { engagementId, folderId: meta.id },
          },
          create: {
            engagementId,
            folderId: meta.id,
            driveId: meta.driveId,
            name: meta.name,
            isPrimary: makePrimary,
            webViewLink: meta.webViewLink,
            linkedById: req.user!.id,
          },
          update: {
            driveId: meta.driveId,
            name: meta.name,
            webViewLink: meta.webViewLink,
            ...(makePrimary ? { isPrimary: true } : {}),
          },
        });
      });

      res.status(201).json(serializeLink(row));
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Link engagement drive folder error', { error: (err as Error).message });
      const mapped = mapDriveApiError(err);
      res.status(mapped.status).json({ error: mapped.error });
    }
  }
);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().min(1),
  driveId: z.string().min(1),
  isPrimary: z.boolean().optional(),
});

// POST /api/engagements/:id/drive-folders/create — create folder on Shared Drive + link
router.post(
  '/create',
  authenticate,
  authorize(...DRIVE_MANAGERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const engagementId = String(req.params.id);
      const eng = await loadEngagementForFirm(engagementId, req.user!.firmId!);
      if (!eng) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }
      const body = createSchema.parse(req.body);
      const meta = await createSharedDriveFolder(req.user!.id, {
        name: body.name,
        parentId: body.parentId,
        driveId: body.driveId,
      });

      const existingCount = await prisma.engagementDriveFolder.count({ where: { engagementId } });
      const makePrimary =
        body.isPrimary === true || (existingCount === 0 && body.isPrimary !== false);

      const row = await prisma.$transaction(async (tx) => {
        if (makePrimary) {
          await tx.engagementDriveFolder.updateMany({
            where: { engagementId, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        return tx.engagementDriveFolder.create({
          data: {
            engagementId,
            folderId: meta.id,
            driveId: meta.driveId,
            name: meta.name,
            isPrimary: makePrimary,
            webViewLink: meta.webViewLink,
            linkedById: req.user!.id,
          },
        });
      });

      res.status(201).json(serializeLink(row));
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Create engagement drive folder error', { error: (err as Error).message });
      const mapped = mapDriveApiError(err);
      res.status(mapped.status).json({ error: mapped.error });
    }
  }
);

// PATCH /api/engagements/:id/drive-folders/:linkId — set primary
router.patch(
  '/:linkId',
  authenticate,
  authorize(...DRIVE_MANAGERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const engagementId = String(req.params.id);
      const linkId = String(req.params.linkId);
      const eng = await loadEngagementForFirm(engagementId, req.user!.firmId!);
      if (!eng) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }
      const body = z.object({ isPrimary: z.literal(true) }).parse(req.body);
      void body;

      const existing = await prisma.engagementDriveFolder.findFirst({
        where: { id: linkId, engagementId },
      });
      if (!existing) {
        res.status(404).json({ error: 'Folder link not found' });
        return;
      }

      const row = await prisma.$transaction(async (tx) => {
        await tx.engagementDriveFolder.updateMany({
          where: { engagementId, isPrimary: true },
          data: { isPrimary: false },
        });
        return tx.engagementDriveFolder.update({
          where: { id: linkId },
          data: { isPrimary: true },
        });
      });

      res.json(serializeLink(row));
    } catch (err) {
      logger.error('Patch engagement drive folder error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to update Drive folder link' });
    }
  }
);

// DELETE /api/engagements/:id/drive-folders/:linkId — unlink only (does not delete in Drive)
router.delete(
  '/:linkId',
  authenticate,
  authorize(...DRIVE_MANAGERS),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const engagementId = String(req.params.id);
      const linkId = String(req.params.linkId);
      const eng = await loadEngagementForFirm(engagementId, req.user!.firmId!);
      if (!eng) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }
      const existing = await prisma.engagementDriveFolder.findFirst({
        where: { id: linkId, engagementId },
      });
      if (!existing) {
        res.status(404).json({ error: 'Folder link not found' });
        return;
      }
      await prisma.engagementDriveFolder.delete({ where: { id: linkId } });
      if (existing.isPrimary) {
        const next = await prisma.engagementDriveFolder.findFirst({
          where: { engagementId },
          orderBy: { createdAt: 'asc' },
        });
        if (next) {
          await prisma.engagementDriveFolder.update({
            where: { id: next.id },
            data: { isPrimary: true },
          });
        }
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error('Unlink engagement drive folder error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to unlink Drive folder' });
    }
  }
);

export default router;
