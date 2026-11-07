import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth.js';
import {
  applyBioOutToAttendance,
  buildBiometricImportTemplateBuffer,
  confirmBiometricImport,
  formatIstHmFromDate,
  reconcileAttendanceBio,
  rowReadyToImport,
  rowsFromCsvText,
  rowsFromWorkbookBuffer,
  stageBiometricImportRows,
  type StagedBiometricRow,
} from '../lib/biometricImport.js';
import { getAttendanceDateKey } from '../lib/attendanceDates.js';
import logger from '../lib/logger.js';
import prisma from '../lib/prisma.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const router = Router();
router.use(authenticate);

const HR_ROLES = ['Partner', 'Admin', 'HR'] as const;

const stagedRowSchema = z.object({
  rowIndex: z.number(),
  employeeCode: z.string(),
  bioName: z.string(),
  date: z.string(),
  inTime: z.string().nullable(),
  outTime: z.string().nullable(),
  workHrs: z.string().nullable(),
  matchAction: z.enum(['use_code', 'use_name', 'manual', 'unresolved']),
  matchedUserId: z.string().nullable(),
  matchedUserName: z.string().nullable(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

// GET /api/attendance/biometric/template
router.get('/template', authorize(...HR_ROLES), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const buf = await buildBiometricImportTemplateBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="biometric-import-template.xlsx"');
    res.send(buf);
  } catch (err) {
    logger.error('Biometric template error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to build template' });
  }
});

// GET /api/attendance/biometric/staff-options — for manual match dropdown
router.get('/staff-options', authorize(...HR_ROLES), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user!.firmId) {
      res.status(403).json({ error: 'Firm context required' });
      return;
    }
    const users = await prisma.user.findMany({
      where: { firmId: req.user!.firmId, isActive: true, role: { not: 'Client' } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeProfile: { select: { employeeCode: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    res.json({
      staff: users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        employeeCode: u.employeeProfile?.employeeCode ?? null,
      })),
    });
  } catch (err) {
    logger.error('Biometric staff options error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load staff' });
  }
});

// POST /api/attendance/biometric/preview
router.post(
  '/preview',
  authorize(...HR_ROLES),
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user!.firmId) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }
      if (!req.file?.buffer) {
        res.status(400).json({ error: 'Upload an .xlsx or .csv file (save .xls as .xlsx first)' });
        return;
      }
      const name = (req.file.originalname || '').toLowerCase();
      if (name.endsWith('.xls') && !name.endsWith('.xlsx')) {
        res.status(400).json({
          error: 'Legacy .xls is not supported. Open in Excel and Save As .xlsx (or export CSV), then upload.',
        });
        return;
      }

      let punches;
      if (name.endsWith('.csv') || req.file.mimetype.includes('csv')) {
        punches = await rowsFromCsvText(req.file.buffer.toString('utf8'));
      } else {
        punches = await rowsFromWorkbookBuffer(req.file.buffer);
      }
      if (!punches.length) {
        res.status(400).json({
          error:
            'No attendance rows found. Expect Organization-Wise Attendance with User ID / Name / Date / In / Out columns.',
        });
        return;
      }

      const staged = await stageBiometricImportRows(req.user!.firmId, punches);
      res.json(staged);
    } catch (err) {
      logger.error('Biometric preview error', { error: (err as Error).message });
      res.status(500).json({ error: (err as Error).message || 'Failed to stage biometric file' });
    }
  }
);

// POST /api/attendance/biometric/confirm
router.post('/confirm', authorize(...HR_ROLES), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user!.firmId) {
      res.status(403).json({ error: 'Firm context required' });
      return;
    }
    const body = z
      .object({
        rows: z.array(stagedRowSchema),
        writeEmployeeCodes: z.boolean().optional(),
      })
      .parse(req.body);

    const rows = body.rows.map((r): StagedBiometricRow => {
      if (r.matchedUserId && r.matchAction === 'unresolved') {
        return { ...r, matchAction: 'manual', errors: r.errors.filter((e) => !e.includes('employeeCode') && !e.includes('Multiple')) };
      }
      return r;
    });

    // Re-validate after manual picks: clear match errors if userId set
    const normalized = rows.map((r) => {
      if (r.matchedUserId) {
        return {
          ...r,
          errors: r.errors.filter(
            (e) =>
              !/employeeCode|No staff|Multiple staff|pick manually|Missing User ID/i.test(e)
          ),
        };
      }
      return r;
    });

    const result = await confirmBiometricImport({
      firmId: req.user!.firmId,
      actorId: req.user!.id,
      rows: normalized,
      writeEmployeeCodes: body.writeEmployeeCodes,
    });
    res.json({
      ...result,
      ready: normalized.filter(rowReadyToImport).length,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Biometric confirm error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to import biometric records' });
  }
});

// GET /api/attendance/biometric/days?from=&to=&flaggedOnly=
router.get('/days', authorize(...HR_ROLES), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user!.firmId) {
      res.status(403).json({ error: 'Firm context required' });
      return;
    }
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const flaggedOnly = String(req.query.flaggedOnly || '') === '1';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      res.status(400).json({ error: 'from and to required as YYYY-MM-DD' });
      return;
    }
    const rows = await prisma.biometricDay.findMany({
      where: {
        firmId: req.user!.firmId,
        date: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T00:00:00.000Z`),
        },
        ...(flaggedOnly ? { deviationFlag: true } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ date: 'asc' }, { bioName: 'asc' }],
      take: 5000,
    });
    res.json({ rows });
  } catch (err) {
    logger.error('Biometric days list error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list biometric days' });
  }
});

// GET /api/attendance/biometric/review?from=&to= — open app days needing Bio Out approval
router.get('/review', authorize(...HR_ROLES), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(403).json({ error: 'Firm context required' });
      return;
    }
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      res.status(400).json({ error: 'from and to required as YYYY-MM-DD' });
      return;
    }
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { bioDeviationMinutes: true },
    });
    const bios = await prisma.biometricDay.findMany({
      where: {
        firmId,
        userId: { not: null },
        date: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T00:00:00.000Z`),
        },
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ date: 'asc' }, { bioName: 'asc' }],
      take: 5000,
    });

    const userIds = [...new Set(bios.map((b) => b.userId).filter(Boolean))] as string[];
    const attRows =
      userIds.length === 0
        ? []
        : await prisma.attendance.findMany({
            where: {
              userId: { in: userIds },
              date: {
                gte: new Date(`${from}T00:00:00+05:30`),
                lte: new Date(`${to}T23:59:59.999+05:30`),
              },
            },
            select: { id: true, userId: true, date: true, checkIn: true, checkOut: true },
          });
    const attByKey = new Map(
      attRows.map((a) => [`${a.userId}|${getAttendanceDateKey(a.date)}`, a] as const)
    );

    const review = [];
    for (const bio of bios) {
      if (!bio.userId) continue;
      const ymd = getAttendanceDateKey(bio.date);
      const att = attByKey.get(`${bio.userId}|${ymd}`);
      const recon = reconcileAttendanceBio({
        appIn: att?.checkIn ? formatIstHmFromDate(att.checkIn) : null,
        appOut: att?.checkOut ? formatIstHmFromDate(att.checkOut) : null,
        bioIn: bio.inTime,
        bioOut: bio.outTime,
        bioHrs: bio.workHrs,
        deviationMinutes: firm?.bioDeviationMinutes ?? 30,
      });
      if (recon.validation === 'ok' && recon.finalBasis === 'matched') continue;
      if (recon.validation === 'ok' && recon.finalBasis === 'app' && !bio.outTime) continue;
      review.push({
        biometricDayId: bio.id,
        attendanceId: att?.id ?? null,
        date: ymd,
        employeeCode: bio.employeeCode,
        bioName: bio.bioName,
        staffName: bio.user
          ? `${bio.user.firstName} ${bio.user.lastName}`.trim()
          : null,
        appIn: att?.checkIn ? formatIstHmFromDate(att.checkIn) : null,
        appOut: att?.checkOut ? formatIstHmFromDate(att.checkOut) : null,
        ...recon,
        canApplyBioOut: Boolean(att?.checkIn && !att.checkOut && bio.outTime),
      });
    }
    res.json({ rows: review });
  } catch (err) {
    logger.error('Biometric review error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load biometric review' });
  }
});

// POST /api/attendance/biometric/apply-out — HR approves Bio Out onto forgotten app logout
router.post('/apply-out', authorize(...HR_ROLES), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user!.firmId) {
      res.status(403).json({ error: 'Firm context required' });
      return;
    }
    const body = z.object({ biometricDayId: z.string().min(1) }).parse(req.body);
    const result = await applyBioOutToAttendance({
      firmId: req.user!.firmId,
      actorId: req.user!.id,
      biometricDayId: body.biometricDayId,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Apply bio out error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to apply Bio Out' });
  }
});

export default router;
