import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { notifyClientPortalUsers } from '../lib/clientScope.js';
import { postEngagementChatMessage } from '../lib/engagementChat.js';
import { isClientSubmittedDocument } from '../lib/engagementDocuments.js';

const router = Router();
router.use(authenticate);

const itemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['Requested', 'Received', 'Missing', 'Revision Required']).optional(),
});

function mapDocument(doc: {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  folder: string;
  category: string | null;
  createdAt: Date;
  uploadedBy: { firstName: string; lastName: string; role: string };
} | null) {
  if (!doc) return null;
  return {
    id: doc.id,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    size: doc.size,
    folder: doc.folder,
    category: doc.category,
    createdAt: doc.createdAt.toISOString(),
    uploadedByName: `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`.trim(),
    uploadedByRole: doc.uploadedBy.role,
    previewUrl: `/api/documents/${doc.id}/download?inline=1`,
    downloadUrl: `/api/documents/${doc.id}/download`,
  };
}

async function resolveSubmissionDocument(
  item: { id: string; title: string; documentId: string | null; engagementId: string },
  clientUploadDocs: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    folder: string;
    category: string | null;
    createdAt: Date;
    uploadedBy: { firstName: string; lastName: string; role: string };
  }>
) {
  if (item.documentId) {
    const linked = clientUploadDocs.find((d) => d.id === item.documentId);
    if (linked) return linked;
    const doc = await prisma.document.findUnique({
      where: { id: item.documentId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        folder: true,
        category: true,
        createdAt: true,
        uploadedBy: { select: { firstName: true, lastName: true, role: true } },
      },
    });
    if (doc) return doc;
  }
  return (
    clientUploadDocs.find((d) => d.category === item.title) ??
    clientUploadDocs.find((d) => d.originalName && item.title.includes(d.originalName.split('.')[0]!)) ??
    null
  );
}

/** GET /api/data-checklist/:engagementId — list checklist items with client submissions */
router.get('/:engagementId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engagementId = String(req.params.engagementId);
    const eng = await prisma.engagement.findFirst({
      where: { id: engagementId, firmId: req.user!.firmId! },
      select: { id: true, scopeIncluded: true, createdAt: true, client: { select: { name: true } } },
    });
    if (!eng) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    const items = await prisma.dataChecklistItem.findMany({
      where: { engagementId },
      orderBy: { createdAt: 'asc' },
    });

    const allEngagementDocs = await prisma.document.findMany({
      where: { engagementId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        folder: true,
        category: true,
        createdAt: true,
        uploadedBy: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    const clientUploadDocs = allEngagementDocs.filter(isClientSubmittedDocument);
    const enriched = await Promise.all(
      items.map(async (item) => {
        const doc = await resolveSubmissionDocument(item, clientUploadDocs);
        return {
          ...item,
          requestedAt: item.requestedAt.toISOString(),
          receivedAt: item.receivedAt?.toISOString() ?? null,
          revisionRequestedAt: item.revisionRequestedAt?.toISOString() ?? null,
          submission: mapDocument(doc),
        };
      })
    );

    res.json({
      engagementRequest: eng.scopeIncluded
        ? {
            scope: eng.scopeIncluded,
            submittedAt: eng.createdAt.toISOString(),
            clientName: eng.client.name,
          }
        : null,
      items: enriched,
      clientUploads: clientUploadDocs.map((d) => mapDocument(d)),
      engagementDocuments: allEngagementDocs.map((d) => mapDocument(d)),
    });
  } catch (err) {
    logger.error('List checklist error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load checklist' });
  }
});

/** POST /api/data-checklist/:engagementId — add item */
router.post('/:engagementId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = itemSchema.parse(req.body);
    const eng = await prisma.engagement.findFirst({
      where: { id: String(req.params.engagementId), firmId: req.user!.firmId! },
    });
    if (!eng) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    const item = await prisma.dataChecklistItem.create({
      data: {
        engagementId: eng.id,
        title: body.title,
        description: body.description,
        status: body.status || 'Requested',
      },
    });
    res.status(201).json(item);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Create checklist error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to add item' });
  }
});

/** PATCH /api/data-checklist/item/:id — update status / title */
router.patch('/item/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = itemSchema.partial().parse(req.body);
    const existing = await prisma.dataChecklistItem.findFirst({
      where: { id: String(req.params.id), engagement: { firmId: req.user!.firmId! } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    const data: Record<string, unknown> = { ...body };
    if (body.status === 'Received' && existing.status !== 'Received') {
      data.receivedAt = new Date();
    }
    const updated = await prisma.dataChecklistItem.update({ where: { id: existing.id }, data });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Update checklist error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update item' });
  }
});

const messageSchema = z.object({
  message: z.string().min(1).max(4000),
});

/** POST /api/data-checklist/item/:id/message-client — send comment to client via engagement chat */
router.post('/item/:id/message-client', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = messageSchema.parse(req.body);
    const item = await prisma.dataChecklistItem.findFirst({
      where: { id: String(req.params.id), engagement: { firmId: req.user!.firmId! } },
      include: { engagement: { select: { id: true, title: true, clientId: true } } },
    });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const sender = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { firstName: true, lastName: true },
    });
    const senderName =
      `${sender?.firstName ?? ''} ${sender?.lastName ?? ''}`.trim() || req.user!.email;
    const chatBody = `Regarding "${item.title}":\n\n${body.message}\n\n— ${senderName}, ${req.user!.role}`;

    await postEngagementChatMessage(item.engagementId, req.user!.id, chatBody, 'text');

    await notifyClientPortalUsers(
      item.engagement.clientId,
      {
        title: 'Message from your audit team',
        message: `Update on "${item.title}" for ${item.engagement.title}. Open Messages to view and reply.`,
        link: '/client/dashboard',
        type: 'info',
      },
      { preference: 'notifyDocumentRequests' }
    ).catch(() => {});

    res.json({ ok: true, message: 'Message sent to client chat' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Message client error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

const revisionSchema = z.object({
  notes: z.string().min(1).max(4000),
});

/** POST /api/data-checklist/item/:id/request-revision — ask client to re-submit */
router.post('/item/:id/request-revision', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = revisionSchema.parse(req.body);
    const item = await prisma.dataChecklistItem.findFirst({
      where: { id: String(req.params.id), engagement: { firmId: req.user!.firmId! } },
      include: { engagement: { select: { id: true, title: true, clientId: true } } },
    });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    await prisma.dataChecklistItem.update({
      where: { id: item.id },
      data: {
        status: 'Revision Required',
        revisionNotes: body.notes,
        revisionRequestedAt: new Date(),
        receivedAt: null,
      },
    });

    const sender = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { firstName: true, lastName: true },
    });
    const senderName =
      `${sender?.firstName ?? ''} ${sender?.lastName ?? ''}`.trim() || req.user!.email;
    const chatBody =
      `Revision requested for "${item.title}":\n\n${body.notes}\n\nPlease upload a corrected file in your client portal. We will review it shortly.\n\n— ${senderName}`;

    await postEngagementChatMessage(item.engagementId, req.user!.id, chatBody, 'text');

    await notifyClientPortalUsers(
      item.engagement.clientId,
      {
        title: 'Document revision requested',
        message: `Please re-submit "${item.title}" for ${item.engagement.title}. See your portal checklist for details.`,
        link: '/client/dashboard',
        type: 'warning',
      },
      { preference: 'notifyDocumentRequests' }
    ).catch(() => {});

    res.json({ ok: true, message: 'Revision request sent to client' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Request revision error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to request revision' });
  }
});

/** POST /api/data-checklist/item/:id/import-to-library — move client file into firm document library */
router.post('/item/:id/import-to-library', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const item = await prisma.dataChecklistItem.findFirst({
      where: { id: String(req.params.id), engagement: { firmId: req.user!.firmId! } },
      include: { engagement: { select: { id: true, firmId: true, clientId: true } } },
    });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    let documentId = item.documentId;
    if (!documentId) {
      const fallback = await prisma.document.findFirst({
        where: {
          engagementId: item.engagementId,
          folder: 'Client Upload',
          category: item.title,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      documentId = fallback?.id ?? null;
    }

    if (!documentId) {
      res.status(400).json({ error: 'No client submission found for this checklist item' });
      return;
    }

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        folder: 'Current File',
        firmId: item.engagement.firmId,
        clientId: item.engagement.clientId,
      },
      select: { id: true, originalName: true, folder: true, category: true },
    });

    await prisma.dataChecklistItem.update({
      where: { id: item.id },
      data: { documentId: updated.id, status: 'Received', receivedAt: new Date() },
    });

    res.json({
      ok: true,
      document: updated,
      message: `"${updated.originalName}" imported to Document Library (Current File).`,
    });
  } catch (err) {
    logger.error('Import to library error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to import document' });
  }
});

/** DELETE /api/data-checklist/item/:id */
router.delete('/item/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.dataChecklistItem.findFirst({
      where: { id: String(req.params.id), engagement: { firmId: req.user!.firmId! } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    await prisma.dataChecklistItem.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete checklist error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

export default router;
