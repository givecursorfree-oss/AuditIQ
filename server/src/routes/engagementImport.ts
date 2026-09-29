import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth.js';
import {
  buildEngagementImportTemplateBuffer,
  confirmEngagementImport,
  rowReadyToImport,
  rowsFromCsvText,
  rowsFromWorkbookBuffer,
  stageEngagementImportRows,
  type StagedEngagementRow,
} from '../lib/engagementImport.js';
import { clientIp } from '../lib/clientIp.js';
import logger from '../lib/logger.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const router = Router();
router.use(authenticate);

const IMPORT_ROLES = ['Partner', 'Admin', 'Manager'] as const;

const stagedRowSchema = z.object({
  rowIndex: z.number(),
  clientName: z.string(),
  title: z.string(),
  type: z.string(),
  financialYear: z.string(),
  partnerEmail: z.string(),
  managerEmail: z.string(),
  articleEmail: z.string().optional(),
  serviceCode: z.string().optional(),
  startDate: z.string().optional(),
  deadline: z.string().optional(),
  billingType: z.string().optional(),
  billingAmount: z.number().optional(),
  scope: z.string().optional(),
  notes: z.string().optional(),
  clientAction: z.enum(['use_existing', 'create_new', 'unresolved']),
  matchedClientId: z.string().nullable().optional(),
  matchedClientName: z.string().nullable().optional(),
  partnerId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  articleId: z.string().nullable().optional(),
  engagementDupAction: z.enum(['skip', 'create_anyway', 'unresolved']),
  duplicateEngagementId: z.string().nullable().optional(),
  duplicateEngagementTitle: z.string().nullable().optional(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

// GET /api/engagements/import/template
router.get(
  '/template',
  authorize(...IMPORT_ROLES),
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const buf = await buildEngagementImportTemplateBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="engagement-import-template.xlsx"');
      res.send(buf);
    } catch (err) {
      logger.error('Import template error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to build template' });
    }
  }
);

// POST /api/engagements/import/preview — stage only, no writes
router.post(
  '/preview',
  authorize(...IMPORT_ROLES),
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user!.firmId) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }
      if (!req.file?.buffer) {
        res.status(400).json({ error: 'Upload an .xlsx or .csv file' });
        return;
      }
      const name = (req.file.originalname || '').toLowerCase();
      let rawRows: Record<string, unknown>[];
      if (name.endsWith('.csv') || req.file.mimetype.includes('csv')) {
        rawRows = await rowsFromCsvText(req.file.buffer.toString('utf8'));
      } else {
        rawRows = await rowsFromWorkbookBuffer(req.file.buffer);
      }
      if (!rawRows.length) {
        res.status(400).json({ error: 'No data rows found' });
        return;
      }
      const rows = await stageEngagementImportRows({
        firmId: req.user!.firmId,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        rawRows,
      });
      const readyCount = rows.filter(rowReadyToImport).length;
      res.json({
        rows,
        summary: {
          total: rows.length,
          ready: readyCount,
          blocked: rows.length - readyCount,
        },
      });
    } catch (err) {
      logger.error('Import preview error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to stage import' });
    }
  }
);

// POST /api/engagements/import/confirm
router.post(
  '/confirm',
  authorize(...IMPORT_ROLES),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user!.firmId) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }
      const body = z.object({ rows: z.array(stagedRowSchema).min(1) }).parse(req.body);
      const result = await confirmEngagementImport({
        firmId: req.user!.firmId,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        rows: body.rows as StagedEngagementRow[],
        ipAddress: clientIp(req),
      });
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Import confirm error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to confirm import' });
    }
  }
);

export default router;
