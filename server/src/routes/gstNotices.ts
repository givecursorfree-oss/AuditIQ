import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { importGstNoticesForClient } from '../lib/gstNoticeApply.js';
import { autoStatusLabel, effectiveNoticeFields, type DueKind } from '../lib/gstNoticeImport.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const router = Router();
router.use(authenticate);

const ROLES = ['Partner', 'Admin', 'Manager', 'Staff', 'HR'] as const;

const APP_STATUSES = [
  'Auto',
  'Responded',
  'Drop order received',
  'Demand order received',
  'Just FYI',
  'Custom',
] as const;
const FOLLOW_UPS = ['None', 'Appeal', 'Payment', 'Hearing', 'Custom'] as const;

function serializeNotice(n: {
  id: string;
  noticeOrderId: string;
  importOrder: number;
  portalType: string | null;
  portalDescription: string | null;
  portalIssueDate: Date | null;
  portalDueDate: Date | null;
  portalDueKind: string;
  portalPeriod: string | null;
  portalSourceStatus: string | null;
  overrideType: string | null;
  overrideDescription: string | null;
  overrideIssueDate: Date | null;
  overrideDueDate: Date | null;
  overrideDueKind: string | null;
  overridePeriod: string | null;
  appStatus: string;
  customStatus: string | null;
  followUp: string;
  customFollowUp: string | null;
  followUpDueDate: Date | null;
  assignedTo: string | null;
  notes: string | null;
  viewState: string;
  editedBy: string | null;
  editedAt: Date | null;
  version: number;
  lastImportedAt: Date | null;
  updatedAt: Date;
}) {
  const eff = effectiveNoticeFields(n);
  return {
    id: n.id,
    noticeOrderId: n.noticeOrderId,
    importOrder: n.importOrder,
    type: eff.type,
    description: eff.description,
    issueDate: eff.issueDate,
    dueDate: eff.dueDate,
    dueKind: eff.dueKind,
    period: eff.period,
    primaryStatus: eff.primaryStatus,
    appStatus: n.appStatus,
    customStatus: n.customStatus,
    followUp: n.followUp,
    customFollowUp: n.customFollowUp,
    followUpLabel: eff.followUpLabel,
    followUpDueDate: eff.followUpDueDate,
    assignedTo: n.assignedTo,
    notes: n.notes,
    viewState: n.viewState,
    portalSourceStatus: n.portalSourceStatus,
    editedBy: n.editedBy,
    editedAt: n.editedAt,
    version: n.version,
    lastImportedAt: n.lastImportedAt,
    updatedAt: n.updatedAt,
    autoStatusPreview: autoStatusLabel(
      eff.dueKind as DueKind,
      eff.dueDate
    ),
  };
}

// GET /api/gst-notices?clientId=
router.get('/', authorize(...ROLES), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const clientId = String(req.query.clientId || '');
    if (!clientId) {
      res.status(400).json({ error: 'clientId is required' });
      return;
    }
    const client = await prisma.client.findFirst({
      where: { id: clientId, firmId: req.user!.firmId!, archivedAt: null },
      select: {
        id: true,
        name: true,
        gstin: true,
        gstNoticeLastImportAt: true,
        gstNoticeDataComplete: true,
      },
    });
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    const notices = await prisma.clientGstNotice.findMany({
      where: { clientId, firmId: req.user!.firmId! },
      orderBy: [{ importOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({
      client,
      lastPortalCheckAt: client.gstNoticeLastImportAt,
      dataComplete: client.gstNoticeDataComplete,
      notices: notices.map(serializeNotice),
    });
  } catch (err) {
    logger.error('List GST notices error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list notices' });
  }
});

// POST /api/gst-notices/import — multipart: file + clientId
router.post(
  '/import',
  authorize('Partner', 'Admin', 'Manager', 'HR'),
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user!.firmId) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }
      const clientId = String(req.body.clientId || '');
      if (!clientId) {
        res.status(400).json({ error: 'clientId is required' });
        return;
      }
      if (!req.file?.buffer) {
        res.status(400).json({ error: 'Upload an .xlsx workbook' });
        return;
      }
      const result = await importGstNoticesForClient({
        firmId: req.user!.firmId,
        clientId,
        buffer: req.file.buffer,
      });
      if (!result.gstinMatchedClient && result.skipped.some((s) => /does not match/i.test(s.reason))) {
        res.status(400).json(result);
        return;
      }
      if (result.gstinValid === false) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      logger.error('GST notice import error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to import notices' });
    }
  }
);

// POST /api/gst-notices/:id/seen
router.post('/:id/seen', authorize(...ROLES), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notice = await prisma.clientGstNotice.findFirst({
      where: { id: String(req.params.id), firmId: req.user!.firmId! },
    });
    if (!notice) {
      res.status(404).json({ error: 'Notice not found' });
      return;
    }
    const updated = await prisma.clientGstNotice.update({
      where: { id: notice.id },
      data: { viewState: 'Seen', seenAt: new Date(), version: { increment: 1 } },
    });
    res.json(serializeNotice(updated));
  } catch (err) {
    logger.error('Mark notice seen error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update notice' });
  }
});

const patchSchema = z.object({
  version: z.number().int(),
  type: z.string().max(40).nullable().optional(),
  period: z.string().max(12).nullable().optional(),
  issueDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  dueKind: z.enum(['date', 'not_applicable', 'unclear']).optional(),
  description: z.string().max(100).nullable().optional(),
  appStatus: z.enum(APP_STATUSES),
  customStatus: z.string().max(30).nullable().optional(),
  followUp: z.enum(FOLLOW_UPS),
  customFollowUp: z.string().max(24).nullable().optional(),
  followUpDueDate: z.string().nullable().optional(),
  assignedTo: z.string().max(40).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  editedBy: z.string().trim().min(1).max(40),
});

// PATCH /api/gst-notices/:id
router.patch('/:id', authorize(...ROLES), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = patchSchema.parse(req.body);
    const notice = await prisma.clientGstNotice.findFirst({
      where: { id: String(req.params.id), firmId: req.user!.firmId! },
    });
    if (!notice) {
      res.status(404).json({ error: 'Notice not found' });
      return;
    }
    if (body.version !== notice.version) {
      res.status(409).json({
        error: 'This notice changed after you opened it. Reload current values.',
        notice: serializeNotice(notice),
      });
      return;
    }
    if (body.appStatus === 'Custom' && !body.customStatus?.trim()) {
      res.status(400).json({ error: 'Custom status is required' });
      return;
    }
    if (body.followUp === 'Custom' && !body.customFollowUp?.trim()) {
      res.status(400).json({ error: 'Custom follow-up is required' });
      return;
    }

    const parseOptDate = (v: string | null | undefined): Date | null => {
      if (v == null || v === '') return null;
      const d = new Date(`${v.slice(0, 10)}T00:00:00.000Z`);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const updated = await prisma.clientGstNotice.update({
      where: { id: notice.id },
      data: {
        overrideType: body.type === undefined ? notice.overrideType : body.type,
        overridePeriod: body.period === undefined ? notice.overridePeriod : body.period,
        overrideDescription:
          body.description === undefined ? notice.overrideDescription : body.description,
        overrideIssueDate:
          body.issueDate === undefined ? notice.overrideIssueDate : parseOptDate(body.issueDate),
        overrideDueDate:
          body.dueDate === undefined ? notice.overrideDueDate : parseOptDate(body.dueDate),
        overrideDueKind: body.dueKind === undefined ? notice.overrideDueKind : body.dueKind,
        appStatus: body.appStatus,
        customStatus: body.appStatus === 'Custom' ? body.customStatus?.trim() || null : null,
        followUp: body.followUp,
        customFollowUp: body.followUp === 'Custom' ? body.customFollowUp?.trim() || null : null,
        followUpDueDate:
          body.followUp === 'None' ? null : parseOptDate(body.followUpDueDate ?? null),
        assignedTo: body.assignedTo === undefined ? notice.assignedTo : body.assignedTo,
        notes: body.notes === undefined ? notice.notes : body.notes,
        editedBy: body.editedBy.trim(),
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    res.json(serializeNotice(updated));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Patch GST notice error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to save notice' });
  }
});

export default router;
