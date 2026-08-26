import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../index.js';
import { authenticate, AuthRequest, authorize } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import {
  ensureFirmLookupsSeeded,
  importCrmClientsFromHrList,
  importCrmClientsFromRows,
  isCompOffEligibleDate,
  listLookupValues,
  LOOKUP_ACTIVITY,
  LOOKUP_CLIENT,
  LOOKUP_HOLIDAY,
  parseHrClientCsv,
} from '../lib/hrLookups.js';
import {
  canHrCreditCompOff,
  canManagerApproveCompOff,
  COMP_OFF_HR_CREDITED,
  COMP_OFF_MANAGER_APPROVED,
  COMP_OFF_PENDING,
  COMP_OFF_REJECTED,
  DEFAULT_COMP_OFF_DAYS,
} from '../lib/compOffPolicy.js';

const router = Router();
router.use(authenticate);

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.includes('csv') ||
      file.mimetype === 'text/plain' ||
      file.originalname.toLowerCase().endsWith('.csv');
    cb(ok ? null : new Error('Only CSV files are allowed'), ok);
  },
});

function requireFirmId(req: AuthRequest, res: Response): string | null {
  const firmId = req.user!.firmId;
  if (!firmId) {
    res.status(400).json({ error: 'Your account is not linked to a firm' });
    return null;
  }
  return firmId;
}

const userSelect = { id: true, firstName: true, lastName: true, initials: true, role: true };

/** GET /api/hr-masters/lookups?kind=attendance_client|activity_classification|firm_holiday */
router.get('/lookups', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const kind = String(req.query.kind || '');
    if (![LOOKUP_CLIENT, LOOKUP_ACTIVITY, LOOKUP_HOLIDAY].includes(kind)) {
      res.status(400).json({
        error: 'kind must be attendance_client | activity_classification | firm_holiday',
      });
      return;
    }
    const values = await listLookupValues(firmId, kind);
    res.json({ kind, values });
  } catch (err) {
    logger.error('List lookups error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load lookups' });
  }
});

/** POST /api/hr-masters/lookups/seed — re-run Excel seed (Partner/Admin/HR) */
router.post('/lookups/seed', authorize('Partner', 'Admin', 'HR'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    await ensureFirmLookupsSeeded(firmId);
    const [clients, activities, holidays] = await Promise.all([
      prisma.firmLookupValue.count({ where: { firmId, kind: LOOKUP_CLIENT } }),
      prisma.firmLookupValue.count({ where: { firmId, kind: LOOKUP_ACTIVITY } }),
      prisma.firmLookupValue.count({ where: { firmId, kind: LOOKUP_HOLIDAY } }),
    ]);
    res.json({ clients, activities, holidays });
  } catch (err) {
    logger.error('Seed lookups error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to seed lookups' });
  }
});

/**
 * POST /api/hr-masters/clients/import-crm
 * Seed-file fallback (bundled 689 names). Prefer CSV upload for updates.
 */
router.post('/clients/import-crm', authorize('Partner', 'Admin', 'HR'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const result = await importCrmClientsFromHrList(firmId);
    const totalClients = await prisma.client.count({ where: { firmId } });
    res.json({ ...result, totalClientsInFirm: totalClients });
  } catch (err) {
    logger.error('CRM client import error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to import CRM clients' });
  }
});

/**
 * POST /api/hr-masters/clients/import-csv
 * multipart field "file" — CSV with columns: name, pan, gstin, contactEmail, contactPhone
 * (name required; others optional). Creates/updates Active CRM clients.
 */
router.post(
  '/clients/import-csv',
  authorize('Partner', 'Admin', 'HR'),
  (req: AuthRequest, res: Response, next: NextFunction) => {
    csvUpload.single('file')(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' });
        return;
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const firmId = requireFirmId(req, res);
      if (!firmId) return;
      const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
      if (!file?.buffer?.length) {
        res.status(400).json({ error: 'Upload a CSV file (columns: name, pan, gstin, contactEmail, contactPhone)' });
        return;
      }
      const text = file.buffer.toString('utf8');
      const rows = parseHrClientCsv(text);
      if (rows.length === 0) {
        res.status(400).json({
          error: 'No client rows found. Use a header row with name (and optional pan, gstin, contactEmail, contactPhone).',
        });
        return;
      }
      const result = await importCrmClientsFromRows(firmId, rows);
      const totalClients = await prisma.client.count({ where: { firmId } });
      res.json({ ...result, totalClientsInFirm: totalClients });
    } catch (err) {
      logger.error('CRM CSV import error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to import CSV clients' });
    }
  }
);

/** POST /api/hr-masters/holidays — add firm holiday YYYY-MM-DD */
router.post('/holidays', authorize('Partner', 'Admin', 'HR'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
    const row = await prisma.firmLookupValue.upsert({
      where: {
        firmId_kind_value: { firmId, kind: LOOKUP_HOLIDAY, value: body.date },
      },
      create: { firmId, kind: LOOKUP_HOLIDAY, value: body.date },
      update: { isActive: true },
    });
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error('Add holiday error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to add holiday' });
  }
});

/** GET /api/hr-masters/comp-off — own list, or firm queue for Manager/HR */
router.get('/comp-off', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const role = req.user!.role;
    const status = req.query.status ? String(req.query.status) : undefined;
    const firmView =
      canManagerApproveCompOff(role) || canHrCreditCompOff(role) || role === 'HR';

    const where: Record<string, unknown> = { firmId };
    if (!firmView) where.userId = req.user!.id;
    if (status) where.status = status;

    const rows = await prisma.compOffRequest.findMany({
      where,
      include: { user: { select: userSelect } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(rows);
  } catch (err) {
    logger.error('List comp-off error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list comp-off requests' });
  }
});

/** POST /api/hr-masters/comp-off — Article assistant request */
router.post('/comp-off', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;

    const articleship = await prisma.articleshipRecord.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!articleship) {
      res.status(403).json({ error: 'Comp-off is for Article Assistants only' });
      return;
    }

    const body = z
      .object({
        workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        days: z.number().min(0.5).max(2).optional(),
        reason: z.string().max(2000).optional(),
      })
      .parse(req.body);

    const workDate = new Date(`${body.workDate}T00:00:00.000Z`);
    if (!(await isCompOffEligibleDate(firmId, workDate))) {
      res.status(400).json({
        error: 'Comp-off only for Sundays or dates on the firm holiday list',
      });
      return;
    }

    const dup = await prisma.compOffRequest.findFirst({
      where: {
        userId: req.user!.id,
        workDate,
        status: { in: [COMP_OFF_PENDING, COMP_OFF_MANAGER_APPROVED, COMP_OFF_HR_CREDITED] },
      },
    });
    if (dup) {
      res.status(409).json({ error: 'A comp-off request already exists for this date' });
      return;
    }

    const row = await prisma.compOffRequest.create({
      data: {
        firmId,
        userId: req.user!.id,
        workDate,
        days: body.days ?? DEFAULT_COMP_OFF_DAYS,
        reason: body.reason,
        status: COMP_OFF_PENDING,
      },
      include: { user: { select: userSelect } },
    });
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error('Create comp-off error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create comp-off request' });
  }
});

/**
 * PATCH /api/hr-masters/comp-off/:id
 * Manager/Partner: Pending → ManagerApproved | Rejected
 * HR/Partner/Admin: ManagerApproved → HrCredited | Rejected (credits firm leave)
 */
router.patch('/comp-off/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = requireFirmId(req, res);
    if (!firmId) return;
    const body = z
      .object({
        status: z.enum([COMP_OFF_MANAGER_APPROVED, COMP_OFF_HR_CREDITED, COMP_OFF_REJECTED]),
        rejectionReason: z.string().max(2000).optional(),
      })
      .parse(req.body);

    const row = await prisma.compOffRequest.findFirst({
      where: { id: req.params.id, firmId },
    });
    if (!row) {
      res.status(404).json({ error: 'Comp-off request not found' });
      return;
    }

    const role = req.user!.role;

    if (body.status === COMP_OFF_MANAGER_APPROVED) {
      if (!canManagerApproveCompOff(role)) {
        res.status(403).json({ error: 'Only Manager or Partner can approve' });
        return;
      }
      if (row.status !== COMP_OFF_PENDING) {
        res.status(400).json({ error: `Cannot approve from status ${row.status}` });
        return;
      }
      const updated = await prisma.compOffRequest.update({
        where: { id: row.id },
        data: {
          status: COMP_OFF_MANAGER_APPROVED,
          managerApprovedById: req.user!.id,
          managerApprovedAt: new Date(),
        },
        include: { user: { select: userSelect } },
      });
      res.json(updated);
      return;
    }

    if (body.status === COMP_OFF_HR_CREDITED) {
      if (!canHrCreditCompOff(role)) {
        res.status(403).json({ error: 'Only HR (or Partner/Admin) can credit leave' });
        return;
      }
      if (row.status !== COMP_OFF_MANAGER_APPROVED) {
        res.status(400).json({ error: 'HR credit requires Manager/Partner approval first' });
        return;
      }

      const articleship = await prisma.articleshipRecord.findUnique({
        where: { userId: row.userId },
        select: { id: true },
      });
      if (!articleship) {
        res.status(400).json({ error: 'Article assistant record missing; cannot credit leave' });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.articleshipRecord.update({
          where: { userId: row.userId },
          data: { firmLeaveCredit: { increment: row.days } },
        });
        return tx.compOffRequest.update({
          where: { id: row.id },
          data: {
            status: COMP_OFF_HR_CREDITED,
            hrCreditedById: req.user!.id,
            hrCreditedAt: new Date(),
          },
          include: { user: { select: userSelect } },
        });
      });
      res.json(updated);
      return;
    }

    // Rejected
    if (!canManagerApproveCompOff(role) && !canHrCreditCompOff(role)) {
      res.status(403).json({ error: 'Insufficient permissions to reject' });
      return;
    }
    if (row.status === COMP_OFF_HR_CREDITED || row.status === COMP_OFF_REJECTED) {
      res.status(400).json({ error: `Cannot reject from status ${row.status}` });
      return;
    }
    const updated = await prisma.compOffRequest.update({
      where: { id: row.id },
      data: {
        status: COMP_OFF_REJECTED,
        rejectedById: req.user!.id,
        rejectedAt: new Date(),
        rejectionReason: body.rejectionReason,
      },
      include: { user: { select: userSelect } },
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error('Patch comp-off error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update comp-off request' });
  }
});

export default router;
