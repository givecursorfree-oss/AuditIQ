import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Local file storage (switch to S3 in production)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.xlsx', '.xls', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.csv', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) { cb(null, true); } else { cb(new Error('File type not allowed')); }
  },
});

// GET /api/documents?engagementId=xxx
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, category, folder } = req.query;
    const where: Record<string, unknown> = {};
    if (engagementId) where.engagementId = String(engagementId);
    if (category) where.category = String(category);
    if (folder) where.folder = String(folder);

    const documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { firstName: true, lastName: true, initials: true } },
      },
    });
    res.json(documents);
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/documents/upload
router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

    const { engagementId, category, folder, workpaperId } = req.body;
    if (!engagementId) { res.status(400).json({ error: 'engagementId is required' }); return; }

    const document = await prisma.document.create({
      data: {
        fileName: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        storagePath: req.file.path,
        category: category || 'Other',
        folder: folder || 'Current File',
        engagementId,
        uploadedById: req.user!.id,
        workpaperId: workpaperId || null,
      },
      include: { uploadedBy: { select: { firstName: true, lastName: true, initials: true } } },
    });

    res.status(201).json(document);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.document.delete({ where: { id: req.params.id } });
    res.json({ message: 'Document deleted' });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ─── Document Requests ───

// GET /api/documents/requests?engagementId=xxx
router.get('/requests', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId } = req.query;
    const where: Record<string, unknown> = {};
    if (engagementId) where.engagementId = String(engagementId);

    const requests = await prisma.documentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err) {
    console.error('List doc requests error:', err);
    res.status(500).json({ error: 'Failed to fetch document requests' });
  }
});

// POST /api/documents/requests
router.post('/requests', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, title, description, dueDate } = req.body;
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
    console.error('Create doc request error:', err);
    res.status(500).json({ error: 'Failed to create document request' });
  }
});

export default router;
