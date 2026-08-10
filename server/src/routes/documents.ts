import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { io } from '../index.js';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { getEnv } from '../lib/env.js';
import { buildDocumentAccessWhere, canAccessDocument, canMutateDocument } from '../lib/documentAccess.js';
import { isFirmLeadershipRole } from '../lib/permissions.js';
import { requireEngagementAccess } from '../lib/engagementAccess.js';
import { enqueueDocumentIndex, removeDocumentFromIndex } from '../lib/documentIndexer.js';
import { ocrPdf } from '../lib/ocrService.js';
import { validateUploadOrRemove } from '../lib/fileSignature.js';

const router = Router();
router.use(authenticate);

const uploadDir = path.join(process.cwd(), getEnv().UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const maxUploadBytes = getEnv().MAX_FILE_SIZE_MB * 1024 * 1024;

const upload = multer({
  storage: storage,
  limits: { fileSize: maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      '.pdf', '.xlsx', '.xls', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.csv', '.txt',
      '.gif', '.webp', '.ppt', '.pptx',
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});

export const documentListSelect = {
  id: true,
  fileName: true,
  originalName: true,
  mimeType: true,
  size: true,
  category: true,
  folder: true,
  version: true,
  parentId: true,
  isOcrProcessed: true,
  source: true,
  externalId: true,
  visibility: true,
  indexStatus: true,
  indexedAt: true,
  createdAt: true,
  engagementId: true,
  uploadedById: true,
  workpaperId: true,
  firmId: true,
  syncedAt: true,
  uploadedBy: { select: { firstName: true, lastName: true, initials: true } },
};

// GET /api/documents?engagementId=xxx&category=&folder=&q=
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { engagementId, category, folder, q, parentId } = req.query;
    const accessWhere = await buildDocumentAccessWhere(
      user.id,
      user.role,
      user.firmId
    );

    const where: Record<string, unknown> = { ...accessWhere };
    if (engagementId) where.engagementId = String(engagementId);
    if (category) where.category = String(category);
    if (folder) where.folder = String(folder);

    const and: Record<string, unknown>[] = [];
    // Version history: all documents in a version tree (root + revisions).
    // Use AND so the access-control OR in accessWhere is preserved.
    if (parentId) {
      const root = String(parentId);
      and.push({ OR: [{ id: root }, { parentId: root }] });
    }
    if (q && String(q).trim()) {
      const query = String(q).trim();
      and.push({
        OR: [
          { originalName: { contains: query } },
          { ocrText: { contains: query } },
          { category: { contains: query } },
          { folder: { contains: query } },
        ],
      });
    }
    if (and.length > 0) where.AND = and;

    const documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: documentListSelect,
    });
    res.json(documents);
  } catch (err) {
    logger.error('List documents error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/documents/upload
router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const signatureError = validateUploadOrRemove(req.file.path, req.file.originalname);
    if (signatureError) {
      res.status(400).json({ error: signatureError });
      return;
    }

    const { engagementId, category, folder, workpaperId, visibility, parentId } = req.body;
    if (!engagementId) {
      res.status(400).json({ error: 'engagementId is required' });
      return;
    }

    if (!(await requireEngagementAccess(req, res, engagementId))) return;

    const engagement = await prisma.engagement.findFirst({
      where: {
        id: engagementId,
        ...(req.user!.firmId ? { firmId: req.user!.firmId } : {}),
      },
      select: { id: true, firmId: true, clientId: true },
    });
    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    // Revised re-upload: chain to the root of the version tree and bump version.
    let resolvedParentId: string | null = null;
    let nextVersion = 1;
    if (parentId) {
      const parent = await prisma.document.findFirst({
        where: {
          id: String(parentId),
          ...(req.user!.firmId ? { firmId: req.user!.firmId } : {}),
        },
        select: { id: true, parentId: true, version: true, category: true, folder: true },
      });
      if (!parent) {
        res.status(404).json({ error: 'Previous version not found' });
        return;
      }
      resolvedParentId = parent.parentId ?? parent.id;
      const latest = await prisma.document.aggregate({
        where: { OR: [{ id: resolvedParentId }, { parentId: resolvedParentId }] },
        _max: { version: true },
      });
      nextVersion = (latest._max.version ?? parent.version ?? 1) + 1;
    }

    const vis = visibility === 'FIRM' ? 'FIRM' : 'ENGAGEMENT';

    const document = await prisma.document.create({
      data: {
        fileName: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        storagePath: req.file.path,
        category: category || 'Other',
        folder: folder || 'Current File',
        source: 'UPLOAD',
        visibility: vis,
        firmId: engagement.firmId,
        clientId: engagement.clientId,
        engagementId,
        uploadedById: req.user!.id,
        workpaperId: workpaperId || null,
        indexStatus: 'PENDING',
        version: nextVersion,
        parentId: resolvedParentId,
      },
      select: documentListSelect,
    });

    enqueueDocumentIndex(document.id);

    if (engagementId) {
      io.to(`engagement:${engagementId}`).emit('document-uploaded', {
        engagementId,
        document: {
          id: document.id,
          originalName: document.originalName,
          uploadedBy: document.uploadedBy,
        },
      });
    }

    res.status(201).json(document);
  } catch (err) {
    logger.error('Upload error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// PATCH /api/documents/:id/visibility
router.patch('/:id/visibility', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const visibility = req.body.visibility === 'FIRM' ? 'FIRM' : 'ENGAGEMENT';
    const doc = await prisma.document.findUnique({ where: { id: String(req.params.id) } });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const allowed = await canAccessDocument(
      req.user!.id,
      req.user!.role,
      req.user!.firmId,
      doc
    );
    if (!allowed || !isFirmLeadershipRole(req.user!.role)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { visibility },
      select: documentListSelect,
    });

    if (doc.firmId) enqueueDocumentIndex(doc.id);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

// POST /api/documents/:id/ocr — one-click OCR for scanned/image PDFs (ocrmypdf --force-ocr)
router.post('/:id/ocr', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: String(req.params.id) } });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const allowed = await canAccessDocument(req.user!.id, req.user!.role, req.user!.firmId, doc);
    if (!allowed) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    if (!doc.storagePath || !fs.existsSync(doc.storagePath)) {
      res.status(404).json({ error: 'File missing from server disk' });
      return;
    }
    const ext = path.extname(doc.originalName).toLowerCase();
    if (ext !== '.pdf' && doc.mimeType !== 'application/pdf') {
      res.status(400).json({ error: 'OCR is only available for PDF files' });
      return;
    }

    const result = await ocrPdf(path.resolve(doc.storagePath), path.resolve(doc.storagePath));
    if (!result.ok) {
      res.status(result.reason === 'unavailable' ? 503 : 500).json({ error: result.message });
      return;
    }

    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { isOcrProcessed: true, indexStatus: 'PENDING' },
      select: documentListSelect,
    });
    enqueueDocumentIndex(doc.id);
    res.json(updated);
  } catch (err) {
    logger.error('OCR error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to run OCR' });
  }
});

// GET /api/documents/:id/download
router.get('/:id/download', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: String(req.params.id) },
    });

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const allowed = await canAccessDocument(
      req.user!.id,
      req.user!.role,
      req.user!.firmId,
      doc
    );
    if (!allowed) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (!doc.storagePath || !fs.existsSync(doc.storagePath)) {
      res.status(404).json({ error: 'File missing from server disk' });
      return;
    }

    const inline = req.query.inline === '1' || req.query.inline === 'true';
    const mime = doc.mimeType || 'application/octet-stream';
    const safeInline = /^(image\/(png|jpeg|jpg|gif|webp)|application\/pdf)$/i.test(mime);
    if (inline && safeInline) {
      res.setHeader('Content-Type', mime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`);
      fs.createReadStream(path.resolve(doc.storagePath)).pipe(res);
      return;
    }

    res.download(path.resolve(doc.storagePath), doc.originalName);
  } catch (err) {
    logger.error('Download error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: String(req.params.id) } });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const allowed = canMutateDocument(req.user!.id, req.user!.role, doc);
    if (!allowed) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await prisma.document.delete({ where: { id: doc.id } });
    if (doc.storagePath && fs.existsSync(doc.storagePath)) {
      fs.unlinkSync(doc.storagePath);
    }
    await removeDocumentFromIndex(doc.firmId, doc.id);

    res.json({ message: 'Document deleted' });
  } catch (err) {
    logger.error('Delete document error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ─── Document Requests ───

router.get('/requests', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user!.firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }
    const { engagementId } = req.query;
    const where: Record<string, unknown> = {
      engagement: { firmId: req.user!.firmId },
    };
    if (engagementId) where.engagementId = String(engagementId);

    const requests = await prisma.documentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err) {
    logger.error('List doc requests error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch document requests' });
  }
});

const docRequestSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

router.post('/requests', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user!.firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }
    const { engagementId, title, description, dueDate } = docRequestSchema.parse(req.body);

    const engagement = await prisma.engagement.findFirst({
      where: { id: engagementId, firmId: req.user!.firmId },
      select: { id: true },
    });
    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    const request = await prisma.documentRequest.create({
      data: {
        engagementId,
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
    });
    res.status(201).json(request);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Create doc request error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create document request' });
  }
});

export default router;
