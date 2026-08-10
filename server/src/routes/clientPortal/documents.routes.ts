import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../index.js';
import logger from '../../lib/logger.js';
import { getEnv } from '../../lib/env.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { isEngagementActivated } from '../../lib/clientScope.js';
import { validateUploadOrRemove } from '../../lib/fileSignature.js';
import { clientPortalUpload, getClientPortalScope } from './shared.js';
import { clientPortalDocumentWhere } from '../../lib/documentAccess.js';

const router = Router();

// GET /api/client/documents
router.get('/documents', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const engagementId = req.query.engagementId ? String(req.query.engagementId) : undefined;

    const documents = await prisma.document.findMany({
      where: clientPortalDocumentWhere(scope.clientId, engagementId),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        category: true,
        createdAt: true,
        size: true,
        mimeType: true,
        engagement: { select: { id: true, title: true } },
        uploadedBy: { select: { firstName: true, lastName: true } },
      },
    });

    res.json(
      documents.map((d) => ({
        id: d.id,
        name: d.originalName,
        type: d.category ?? d.mimeType,
        uploadedAt: d.createdAt.toISOString(),
        size: d.size,
        uploadedBy: `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`,
        engagementId: d.engagement?.id ?? null,
        engagementName: d.engagement?.title ?? 'General',
      }))
    );
  } catch (err) {
    logger.error('Client portal - list documents error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.post('/documents/upload', clientPortalUpload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const signatureError = validateUploadOrRemove(file.path, file.originalname);
    if (signatureError) {
      res.status(400).json({ error: signatureError });
      return;
    }

    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const userId = req.user!.id;
    const { engagementId } = req.body;

    if (!engagementId) {
      res.status(400).json({ error: 'engagementId is required' });
      return;
    }

    const engagement = await prisma.engagement.findFirst({
      where: { id: String(engagementId), clientId: scope.clientId },
    });

    if (!engagement) {
      res.status(403).json({ error: 'Engagement not found or access denied' });
      return;
    }

    if (!isEngagementActivated(engagement)) {
      res.status(403).json({
        error: 'This engagement is pending team allocation. Upload will be available once the firm activates it.',
        code: 'ENGAGEMENT_NOT_ACTIVATED',
      });
      return;
    }

    const document = await prisma.document.create({
      data: {
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath: file.path,
        category: req.body.category?.trim() || 'General upload',
        folder: 'Client Upload',
        source: 'UPLOAD',
        firmId: engagement.firmId,
        clientId: engagement.clientId,
        engagementId: engagement.id,
        uploadedById: userId,
      },
    });

    // Notify assigned team about the upload
    const assigneeIds = [engagement.partnerInChargeId, engagement.managerId, engagement.articleAssistantId].filter(Boolean) as string[];
    if (assigneeIds.length > 0) {
      await prisma.notification.createMany({
        data: assigneeIds.map((uid) => ({
          userId: uid,
          title: 'Client document uploaded',
          message: `${scope.clientName || 'Client'} uploaded "${file.originalname}" for ${engagement.title}.`,
          type: 'info' as const,
          link: `/engagements/${engagement.id}?tab=documents`,
        })),
      }).catch(() => {});
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'DOCUMENT_UPLOAD',
        entity: 'Document',
        entityId: document.id,
        userId,
        details: `Client uploaded ${file.originalname} (${file.size} bytes)`,
      },
    }).catch(() => {});

    res.status(201).json({
      id: document.id,
      name: document.originalName,
      type: document.category,
      uploadedAt: document.createdAt.toISOString(),
      size: document.size,
      engagementId: engagement.id,
      message: 'Your document has been received and logged. The team will review it shortly.',
    });
  } catch (err) {
    logger.error('Client portal - upload document error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// POST /api/client/checklist/:itemId/upload — upload file for a checklist item
router.post('/checklist/:itemId/upload', clientPortalUpload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const signatureError = validateUploadOrRemove(file.path, file.originalname);
    if (signatureError) {
      res.status(400).json({ error: signatureError });
      return;
    }

    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const item = await prisma.dataChecklistItem.findFirst({
      where: {
        id: String(req.params.itemId),
        engagement: { clientId: scope.clientId },
      },
      include: { engagement: true },
    });

    if (!item) {
      res.status(403).json({ error: 'Checklist item not found or access denied' });
      return;
    }

    if (!isEngagementActivated(item.engagement)) {
      res.status(403).json({
        error: 'This engagement is pending team allocation. Upload will be available once the firm activates it.',
        code: 'ENGAGEMENT_NOT_ACTIVATED',
      });
      return;
    }

    const userId = req.user!.id;
    const document = await prisma.document.create({
      data: {
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath: file.path,
        category: item.title,
        folder: 'Client Upload',
        engagementId: item.engagementId,
        uploadedById: userId,
      },
    });

    await prisma.dataChecklistItem.update({
      where: { id: item.id },
      data: {
        status: 'Received',
        receivedAt: new Date(),
        documentId: document.id,
        revisionNotes: null,
        revisionRequestedAt: null,
      },
    });

    const assigneeIds = [
      item.engagement.partnerInChargeId,
      item.engagement.managerId,
      item.engagement.articleAssistantId,
    ].filter(Boolean) as string[];

    if (assigneeIds.length > 0) {
      await prisma.notification.createMany({
        data: assigneeIds.map((uid) => ({
          userId: uid,
          title: 'Client document uploaded',
          message: `${scope.clientName || 'Client'} uploaded "${item.title}" for ${item.engagement.title}.`,
          type: 'info' as const,
          link: `/engagements/${item.engagementId}?tab=documents`,
        })),
      }).catch(() => {});
    }

    await prisma.auditLog.create({
      data: {
        action: 'CHECKLIST_UPLOAD',
        entity: 'DataChecklistItem',
        entityId: item.id,
        userId,
        details: `Client uploaded ${file.originalname} for checklist: ${item.title}`,
      },
    }).catch(() => {});

    res.status(201).json({
      documentId: document.id,
      checklistItemId: item.id,
      status: 'Uploaded',
      message: 'Your document has been received and logged. The team will review it shortly.',
    });
  } catch (err) {
    logger.error('Client portal - checklist upload error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// POST /api/client/documents/:id/download-url — 15-minute signed download link
router.post('/documents/:id/download-url', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const doc = await prisma.document.findFirst({
      where: {
        id: String(req.params.id),
        ...clientPortalDocumentWhere(scope.clientId),
      },
      select: { id: true, originalName: true },
    });

    if (!doc) {
      res.status(403).json({ error: 'Document not found or access denied' });
      return;
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const token = jwt.sign(
      {
        purpose: 'client-doc-download',
        documentId: doc.id,
        clientId: scope.clientId,
        sub: req.user!.id,
      },
      getEnv().JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      url: `/api/client/documents/download?token=${token}`,
      expiresAt: expiresAt.toISOString(),
      fileName: doc.originalName,
    });
  } catch (err) {
    logger.error('Client portal - signed download URL error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to generate download link' });
  }
});

// GET /api/client/documents/download?token=... — stream file via signed token
router.get('/documents/download', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = String(req.query.token || '');
    if (!token) {
      res.status(400).json({ error: 'Download token is required' });
      return;
    }

    const payload = jwt.verify(token, getEnv().JWT_SECRET, { algorithms: ['HS256'] }) as {
      purpose?: string;
      documentId?: string;
      clientId?: string;
      sub?: string;
    };

    if (payload.purpose !== 'client-doc-download' || !payload.documentId || !payload.clientId) {
      res.status(403).json({ error: 'Invalid download token' });
      return;
    }

    const scope = await getClientPortalScope(req, res);
    if (!scope) return;
    if (scope.clientId !== payload.clientId || req.user!.id !== payload.sub) {
      res.status(403).json({ error: 'Invalid download token' });
      return;
    }

    const doc = await prisma.document.findFirst({
      where: {
        id: payload.documentId,
        ...clientPortalDocumentWhere(scope.clientId),
      },
    });

    if (!doc || !doc.storagePath || !fs.existsSync(doc.storagePath)) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.download(path.resolve(doc.storagePath), doc.originalName);
  } catch (err) {
    if ((err as Error).name === 'TokenExpiredError') {
      res.status(403).json({ error: 'Download link has expired. Please request a new link.' });
      return;
    }
    logger.error('Client portal - document download error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to download document' });
  }
});

export default router;
