import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { getEnv } from '../lib/env.js';
import { optionalString, optionalEmail, emptyToUndefined } from '../lib/zodHelpers.js';
import { validateBufferSignature } from '../lib/fileSignature.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const uploadDir = path.join(process.cwd(), getEnv().UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

router.use(authenticate);

/** Tenant guard: the client must belong to the requesting user's firm. */
async function requireClientInFirm(req: AuthRequest, res: Response, clientId: string): Promise<boolean> {
  if (!req.user!.firmId) {
    res.status(400).json({ error: 'Your account is not linked to a firm' });
    return false;
  }
  const client = await prisma.client.findFirst({
    where: { id: clientId, firmId: req.user!.firmId },
    select: { id: true },
  });
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return false;
  }
  return true;
}

// ─── Client Contacts ───

const contactSchema = z.object({
  name: z.string().min(1),
  designation: optionalString,
  email: optionalEmail,
  phone: optionalString,
  isPrimary: z.boolean().default(false),
  department: optionalString,
});

// GET /api/client-master/:clientId/contacts
router.get('/:clientId/contacts', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClientInFirm(req, res, req.params.clientId))) return;
    const contacts = await prisma.clientContact.findMany({
      where: { clientId: req.params.clientId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
    res.json(contacts);
  } catch (err) {
    logger.error('Failed to list client contacts', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list contacts' });
  }
});

// POST /api/client-master/:clientId/contacts
router.post('/:clientId/contacts', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClientInFirm(req, res, req.params.clientId))) return;
    const data = contactSchema.parse(req.body);

    // If primary, unset other primaries
    if (data.isPrimary) {
      await prisma.clientContact.updateMany({
        where: { clientId: req.params.clientId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.clientContact.create({
      data: { clientId: req.params.clientId, ...data },
    });
    res.status(201).json(contact);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to create client contact', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/client-master/:clientId/contacts/:contactId
router.put('/:clientId/contacts/:contactId', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClientInFirm(req, res, req.params.clientId))) return;
    const data = contactSchema.partial().parse(req.body);

    const existing = await prisma.clientContact.findFirst({
      where: { id: req.params.contactId, clientId: req.params.clientId },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    if (data.isPrimary) {
      await prisma.clientContact.updateMany({
        where: { clientId: req.params.clientId, isPrimary: true, NOT: { id: req.params.contactId } },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.clientContact.update({
      where: { id: existing.id },
      data,
    });
    res.json(contact);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to update client contact', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE /api/client-master/:clientId/contacts/:contactId
router.delete('/:clientId/contacts/:contactId', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClientInFirm(req, res, req.params.clientId))) return;
    const existing = await prisma.clientContact.findFirst({
      where: { id: req.params.contactId, clientId: req.params.clientId },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    await prisma.clientContact.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete client contact', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// ─── Client Directors ───

const directorSchema = z.object({
  din: optionalString,
  name: z.string().min(1),
  designation: optionalString,
  pan: z.preprocess(emptyToUndefined, z.string().max(10).optional()),
  aadhaar: z.preprocess(emptyToUndefined, z.string().max(12).optional()),
  email: optionalEmail,
  phone: optionalString,
  appointmentDate: optionalString,
  isActive: z.boolean().default(true),
});

// GET /api/client-master/:clientId/directors
router.get('/:clientId/directors', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClientInFirm(req, res, req.params.clientId))) return;
    const directors = await prisma.clientDirector.findMany({
      where: { clientId: req.params.clientId },
      orderBy: { name: 'asc' },
    });
    res.json(directors);
  } catch (err) {
    logger.error('Failed to list directors', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list directors' });
  }
});

// POST /api/client-master/:clientId/directors
router.post('/:clientId/directors', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClientInFirm(req, res, req.params.clientId))) return;
    const data = directorSchema.parse(req.body);
    const parsed = {
      ...data,
      appointmentDate: data.appointmentDate ? new Date(data.appointmentDate) : undefined,
    };

    const director = await prisma.clientDirector.create({
      data: { clientId: req.params.clientId, ...parsed },
    });
    res.status(201).json(director);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to create director', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create director' });
  }
});

// PUT /api/client-master/:clientId/directors/:dirId
router.put('/:clientId/directors/:dirId', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClientInFirm(req, res, req.params.clientId))) return;
    const data = directorSchema.partial().parse(req.body);
    const parsed: Record<string, unknown> = { ...data };
    if (data.appointmentDate) parsed.appointmentDate = new Date(data.appointmentDate);

    const existing = await prisma.clientDirector.findFirst({
      where: { id: req.params.dirId, clientId: req.params.clientId },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Director not found' });
      return;
    }

    const director = await prisma.clientDirector.update({
      where: { id: existing.id },
      data: parsed,
    });
    res.json(director);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to update director', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update director' });
  }
});

// DELETE /api/client-master/:clientId/directors/:dirId
router.delete('/:clientId/directors/:dirId', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClientInFirm(req, res, req.params.clientId))) return;
    const existing = await prisma.clientDirector.findFirst({
      where: { id: req.params.dirId, clientId: req.params.clientId },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Director not found' });
      return;
    }
    await prisma.clientDirector.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete director', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete director' });
  }
});

// ─── Client Documents (KYC/Statutory) ───

// GET /api/client-master/:clientId/documents
router.get('/:clientId/documents', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docs = await prisma.clientDocument.findMany({
      where: { clientId: req.params.clientId },
      select: {
        id: true,
        docType: true,
        originalName: true,
        mimeType: true,
        size: true,
        financialYear: true,
        uploadedAt: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });
    res.json(docs);
  } catch (err) {
    logger.error('Failed to list client documents', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// POST /api/client-master/:clientId/documents
router.post('/:clientId/documents', authorize('Partner', 'Admin', 'Manager'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = req.file;
    const { docType, financialYear } = req.body;

    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const signatureError = validateBufferSignature(file.buffer, file.originalname);
    if (signatureError) { res.status(400).json({ error: signatureError }); return; }
    if (!docType) { res.status(400).json({ error: 'docType is required' }); return; }
    if (!(await requireClientInFirm(req, res, req.params.clientId))) return;

    const storedName = `client-doc-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`;
    const storagePath = path.join(uploadDir, storedName);
    fs.writeFileSync(storagePath, file.buffer);

    const doc = await prisma.clientDocument.create({
      data: {
        clientId: req.params.clientId,
        docType,
        financialYear: financialYear || null,
        fileName: storedName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath,
      },
    });

    res.status(201).json({
      id: doc.id,
      docType: doc.docType,
      originalName: doc.originalName,
      size: doc.size,
      uploadedAt: doc.uploadedAt,
    });
  } catch (err) {
    logger.error('Failed to upload client document', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/client-master/:clientId/documents/:docId/download
router.get('/:clientId/documents/:docId/download', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClientInFirm(req, res, req.params.clientId))) return;
    const doc = await prisma.clientDocument.findFirst({
      where: { id: req.params.docId, clientId: req.params.clientId },
    });
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    if (!doc.storagePath || !fs.existsSync(doc.storagePath)) {
      res.status(404).json({ error: 'File missing from server disk' });
      return;
    }

    res.download(path.resolve(doc.storagePath), doc.originalName);
  } catch (err) {
    logger.error('Failed to download client document', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// DELETE /api/client-master/:clientId/documents/:docId
router.delete('/:clientId/documents/:docId', authorize('Partner', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClientInFirm(req, res, req.params.clientId))) return;
    const doc = await prisma.clientDocument.findFirst({
      where: { id: req.params.docId, clientId: req.params.clientId },
    });
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

    await prisma.clientDocument.delete({ where: { id: doc.id } });
    if (doc.storagePath && fs.existsSync(doc.storagePath)) {
      fs.unlinkSync(doc.storagePath);
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete client document', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
