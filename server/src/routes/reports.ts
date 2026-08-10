import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, AuthRequest, authorize } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import {
  engagementIdsFilter,
  requireEngagementAccess,
  requireReportAccess,
} from '../lib/engagementAccess.js';
import { generateForm3CDPDF, generateAuditReportPDF } from '../lib/pdfGenerator.js';
import { notifyClientPortalUsers } from '../lib/clientScope.js';

const router = Router();
router.use(authenticate);

// GET /api/reports?engagementId=xxx
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, type } = req.query;
    const engFilter = await engagementIdsFilter(
      req.user!.id,
      req.user!.role,
      req.user!.firmId
    );
    const where: Record<string, unknown> = { ...engFilter };
    if (engagementId) {
      if (!(await requireEngagementAccess(req, res, String(engagementId)))) return;
      where.engagementId = String(engagementId);
    }
    if (type) where.type = String(type);

    const reports = await prisma.report.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
      include: {
        engagement: { select: { title: true, client: { select: { name: true } } } },
      },
    });
    res.json(reports);
  } catch (err) {
    logger.error('List reports error:', err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// POST /api/reports — generate a report
const createReportSchema = z.object({
  type: z.string().min(1).optional(),
  title: z.string().min(1),
  content: z.string().optional(),
  engagementId: z.string().uuid().optional(),
});

router.post('/', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, type, title, content } = createReportSchema.parse(req.body);
    if (!engagementId) {
      res.status(400).json({ error: 'engagementId is required' });
      return;
    }
    if (!(await requireEngagementAccess(req, res, engagementId))) return;
    const report = await prisma.report.create({
      data: {
        engagementId,
        type: type || 'Statutory Audit',
        title,
        content: content || '',
      },
    });
    res.status(201).json(report);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Create report error:', err);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

// GET /api/reports/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireReportAccess(req, res, String(req.params.id)))) return;
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: {
        engagement: {
          select: { title: true, client: { select: { name: true } } },
        },
        form3cdData: { orderBy: { clauseNumber: 'asc' } },
      },
    });
    if (!report) { res.status(404).json({ error: 'Report not found' }); return; }
    res.json(report);
  } catch (err) {
    logger.error('Get report error:', err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// PATCH /api/reports/:id/share-with-client — make draft visible in client portal
router.patch('/:id/share-with-client', authorize('Partner', 'Manager', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireReportAccess(req, res, String(req.params.id)))) return;
    const report = await prisma.report.findUnique({
      where: { id: String(req.params.id) },
      include: { engagement: { select: { id: true, title: true, clientId: true, firmId: true } } },
    });
    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }
    if (report.engagement.firmId !== req.user!.firmId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const shared = Boolean(req.body?.shared ?? true);
    const updated = await prisma.report.update({
      where: { id: report.id },
      data: {
        sharedWithClient: shared,
        sharedWithClientAt: shared ? new Date() : null,
      },
    });

    if (shared) {
      await notifyClientPortalUsers(report.engagement.clientId, {
        title: 'Draft report shared',
        message: `A draft report "${report.title}" is ready for your review on ${report.engagement.title}.`,
        link: '/client/dashboard',
        type: 'info',
      }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    logger.error('Share report with client error:', err);
    res.status(500).json({ error: 'Failed to update report sharing' });
  }
});

// PUT /api/reports/:id
router.put('/:id', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireReportAccess(req, res, String(req.params.id)))) return;
    const { title, content, status } = req.body;
    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: { title, content, status },
    });
    res.json(report);
  } catch (err) {
    logger.error('Update report error:', err);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// ─── Form 3CD Clauses (Tax Audit) ───

// GET /api/reports/form3cd/:reportId
router.get('/form3cd/:reportId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireReportAccess(req, res, String(req.params.reportId)))) return;
    const clauses = await prisma.form3CDClause.findMany({
      where: { reportId: req.params.reportId },
      orderBy: { clauseNumber: 'asc' },
    });
    res.json(clauses);
  } catch (err) {
    logger.error('List Form3CD clauses error:', err);
    res.status(500).json({ error: 'Failed to fetch clauses' });
  }
});

// POST /api/reports/form3cd — create/update a clause
router.post('/form3cd', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reportId, clauseNumber, clauseTitle, response, isApplicable, remarks } = req.body;
    if (!reportId || !(await requireReportAccess(req, res, reportId))) return;

    const existing = await prisma.form3CDClause.findFirst({
      where: { reportId, clauseNumber },
    });

    let clause;
    if (existing) {
      clause = await prisma.form3CDClause.update({
        where: { id: existing.id },
        data: { response, isApplicable, remarks },
      });
    } else {
      clause = await prisma.form3CDClause.create({
        data: {
          reportId,
          clauseNumber,
          clauseTitle: clauseTitle || `Clause ${clauseNumber}`,
          response: response || '',
          isApplicable: isApplicable ?? true,
          remarks,
        },
      });
    }
    res.status(201).json(clause);
  } catch (err) {
    logger.error('Create/update Form3CD clause error:', err);
    res.status(500).json({ error: 'Failed to save clause' });
  }
});

// ─── Observations (ICAI Format) ───

// GET /api/reports/observations?engagementId=xxx
router.get('/observations', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, severity } = req.query;
    const engFilter = await engagementIdsFilter(
      req.user!.id,
      req.user!.role,
      req.user!.firmId
    );
    const where: Record<string, unknown> = { ...engFilter };
    if (engagementId) {
      if (!(await requireEngagementAccess(req, res, String(engagementId)))) return;
      where.engagementId = String(engagementId);
    }
    if (severity) where.severity = String(severity);

    const observations = await prisma.observation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(observations);
  } catch (err) {
    logger.error('List observations error:', err);
    res.status(500).json({ error: 'Failed to fetch observations' });
  }
});

// POST /api/reports/observations
router.post('/observations', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, title, criteria, condition, cause, effect, recommendation, severity, status } = req.body;
    if (!engagementId || !(await requireEngagementAccess(req, res, engagementId))) return;
    const observation = await prisma.observation.create({
      data: {
        engagementId,
        title,
        criteria: criteria || '',
        condition: condition || '',
        cause: cause || '',
        effect: effect || '',
        recommendation: recommendation || '',
        severity: severity || 'Moderate',
        status: status || 'Open',
      },
    });
    res.status(201).json(observation);
  } catch (err) {
    logger.error('Create observation error:', err);
    res.status(500).json({ error: 'Failed to create observation' });
  }
});

// ─── PDF Export ───

// GET /api/reports/:id/pdf — download report as PDF
router.get('/:id/pdf', authorize('Partner', 'Manager', 'Admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireReportAccess(req, res, String(req.params.id)))) return;
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: {
        engagement: {
          include: {
            client: true,
            firm: true,
          },
        },
        form3cdData: { orderBy: { clauseNumber: 'asc' } },
      },
    });

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    const firm = report.engagement.firm;
    const client = report.engagement.client;
    const engagement = report.engagement;

    const firmInfo = {
      name: firm.name,
      registrationNo: firm.registrationNo,
      pan: firm.pan,
      gstin: firm.gstin,
      address: firm.address,
      city: firm.city,
      state: firm.state,
      phone: firm.phone,
      email: firm.email,
    };

    const clientInfo = {
      name: client.name,
      pan: client.pan,
      cin: client.cin,
      gstin: client.gstin,
      address: client.address,
    };

    const engagementInfo = {
      title: engagement.title,
      type: engagement.type,
      financialYear: engagement.financialYear,
      status: engagement.status,
    };

    // Form 3CD reports use the clause-based generator
    if (report.type.includes('3CD') || report.type.includes('Tax Audit')) {
      generateForm3CDPDF(res, firmInfo, clientInfo, engagementInfo, report.form3cdData);
    } else {
      generateAuditReportPDF(res, firmInfo, clientInfo, engagementInfo, report.content ?? '', report.title);
    }

    logger.info('PDF generated', { reportId: report.id, type: report.type });
  } catch (err) {
    logger.error('PDF generation error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

export default router;
