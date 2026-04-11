import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { authenticate, AuthRequest, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/reports?engagementId=xxx
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, type } = req.query;
    const where: Record<string, unknown> = {};
    if (engagementId) where.engagementId = String(engagementId);
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
    console.error('List reports error:', err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// POST /api/reports — generate a report
router.post('/', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, type, title, content } = req.body;
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
    console.error('Create report error:', err);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

// GET /api/reports/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
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
    console.error('Get report error:', err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// PUT /api/reports/:id
router.put('/:id', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, content, status } = req.body;
    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: { title, content, status },
    });
    res.json(report);
  } catch (err) {
    console.error('Update report error:', err);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// ─── Form 3CD Clauses (Tax Audit) ───

// GET /api/reports/form3cd/:reportId
router.get('/form3cd/:reportId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const clauses = await prisma.form3CDClause.findMany({
      where: { reportId: req.params.reportId },
      orderBy: { clauseNumber: 'asc' },
    });
    res.json(clauses);
  } catch (err) {
    console.error('List Form3CD clauses error:', err);
    res.status(500).json({ error: 'Failed to fetch clauses' });
  }
});

// POST /api/reports/form3cd — create/update a clause
router.post('/form3cd', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reportId, clauseNumber, clauseTitle, response, isApplicable, remarks } = req.body;

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
    console.error('Create/update Form3CD clause error:', err);
    res.status(500).json({ error: 'Failed to save clause' });
  }
});

// ─── Observations (ICAI Format) ───

// GET /api/reports/observations?engagementId=xxx
router.get('/observations', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, severity } = req.query;
    const where: Record<string, unknown> = {};
    if (engagementId) where.engagementId = String(engagementId);
    if (severity) where.severity = String(severity);

    const observations = await prisma.observation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(observations);
  } catch (err) {
    console.error('List observations error:', err);
    res.status(500).json({ error: 'Failed to fetch observations' });
  }
});

// POST /api/reports/observations
router.post('/observations', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId, title, criteria, condition, cause, effect, recommendation, severity, status } = req.body;
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
    console.error('Create observation error:', err);
    res.status(500).json({ error: 'Failed to create observation' });
  }
});

export default router;
