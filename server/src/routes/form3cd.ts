import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import {
  requireForm3cdClauseAccess,
  requireReportAccess,
} from '../lib/engagementAccess.js';

const router = Router();
router.use(authenticate);

// Default 44 clauses of Form 3CD
const DEFAULT_CLAUSES = [
  { num: 1, title: 'Name of the assessee' },
  { num: 2, title: 'Address' },
  { num: 3, title: 'Permanent Account Number (PAN)' },
  { num: 4, title: 'Whether the assessee is liable to pay indirect tax' },
  { num: 5, title: 'Status of the assessee' },
  { num: 6, title: 'Previous year ended on' },
  { num: 7, title: 'Assessment year' },
  { num: 8, title: 'Relevant clause of section 44AB under which the audit is conducted' },
  { num: 9, title: 'Partner/Member details and profit sharing ratios' },
  { num: 10, title: 'Nature of business or profession' },
  { num: 11, title: 'Books of account maintained (Section 44AA)' },
  { num: 12, title: 'Whether books of accounts examined at business premises' },
  { num: 13, title: 'Method of accounting employed in the previous year' },
  { num: 14, title: 'Method of valuation of closing stock' },
  { num: 15, title: 'Capital account of partners in the firm or members of the AOP/BOI' },
  { num: 16, title: 'Land or building or both transferred below stamp duty value — Section 43CA / 50C' },
  { num: 17, title: 'Amounts not credited to the profit and loss account (Section 145)' },
  { num: 18, title: 'Particulars of depreciation allowable as per Income Tax Act' },
  { num: 19, title: 'Amounts admissible as deduction under Sections 32AC, 33AB, 33ABA, 35, 35ABB, 35AC, etc.' },
  { num: 20, title: 'Section 40 — disallowances' },
  { num: 21, title: 'Amounts debited to the P&L account being disallowable under Section 40A' },
  { num: 22, title: 'Amount of interest inadmissible under Section 23 of the MSME Development Act' },
  { num: 23, title: 'Particulars of payments made to specified persons under Section 40A(2)(b)' },
  { num: 24, title: 'Amounts deemed to be profits u/s 33AB, 33ABA, 33AC' },
  { num: 25, title: 'Any amount of profit chargeable under Section 41' },
  { num: 26, title: 'In respect of any sum deductible under Section 36(1)(vii) or (viia)' },
  { num: 27, title: 'Section 43B — amounts unpaid on the last day of the previous year' },
  { num: 28, title: 'Central Value Added Tax credits availed or utilised' },
  { num: 29, title: 'Particulars of brought-forward loss or depreciation' },
  { num: 30, title: 'Section 269SS — loans/deposits taken/accepted other than by account payee cheque/draft' },
  { num: 31, title: 'Section 269T — repayment of loans/deposits other than by account payee cheque/draft' },
  { num: 32, title: 'Brought forward loss or depreciation allowance in relation to a change in shareholding' },
  { num: 33, title: 'Section 269ST — receipt of amount exceeding two lakh rupees' },
  { num: 34, title: 'TDS/TCS compliance' },
  { num: 35, title: 'Quantitative details of principal raw materials, finished products, etc.' },
  { num: 36, title: 'In the case of a domestic company — details of tax on distributed profits u/s 115-O' },
  { num: 37, title: 'Whether the assessee has received any property (money or value)' },
  { num: 38, title: 'Whether primary adjustment (Section 92CE) or secondary adjustment is required' },
  { num: 39, title: 'Whether the assessee has entered into an impermissible avoidance arrangement (GAAR)' },
  { num: 40, title: 'Whether any expenditure by way of fee/charge/royalty to specified Sections' },
  { num: 41, title: 'Details u/s 56(2)(ix) and Section 56(2)(x)' },
  { num: 42, title: 'Turnover, gross receipts, gross profit reporting' },
  { num: 43, title: 'Cash receipts exceeding prescribed limit' },
  { num: 44, title: 'Break-up of total expenditure of entities registered under GST/Service Tax' },
];

// GET /api/form3cd/:reportId — clauses for a report
router.get('/:reportId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireReportAccess(req, res, String(req.params.reportId)))) return;
    const clauses = await prisma.form3CDClause.findMany({
      where: { reportId: req.params.reportId },
      orderBy: { clauseNumber: 'asc' },
    });
    res.json(clauses);
  } catch (err) {
    logger.error('Get Form 3CD clauses error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch Form 3CD clauses' });
  }
});

// POST /api/form3cd/:reportId/initialize — create all 44 clauses for a report
router.post('/:reportId/initialize', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireReportAccess(req, res, String(req.params.reportId)))) return;
    const existing = await prisma.form3CDClause.count({ where: { reportId: req.params.reportId } });
    if (existing > 0) {
      res.status(400).json({ error: 'Clauses already initialized for this report' });
      return;
    }

    await prisma.form3CDClause.createMany({
      data: DEFAULT_CLAUSES.map(c => ({
        clauseNumber: c.num,
        clauseTitle: c.title,
        reportId: req.params.reportId,
      })),
    });

    const clauses = await prisma.form3CDClause.findMany({
      where: { reportId: req.params.reportId },
      orderBy: { clauseNumber: 'asc' },
    });
    res.status(201).json(clauses);
  } catch (err) {
    logger.error('Initialize Form 3CD error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to initialize Form 3CD' });
  }
});

// PATCH /api/form3cd/clause/:id — update a single clause
router.patch('/clause/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireForm3cdClauseAccess(req, res, String(req.params.id)))) return;
    const { response, remarks, isApplicable, isCompleted } = req.body;
    const clause = await prisma.form3CDClause.update({
      where: { id: req.params.id },
      data: {
        ...(response !== undefined && { response }),
        ...(remarks !== undefined && { remarks }),
        ...(isApplicable !== undefined && { isApplicable }),
        ...(isCompleted !== undefined && { isCompleted }),
      },
    });
    res.json(clause);
  } catch (err) {
    logger.error('Update Form 3CD clause error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update clause' });
  }
});

// PATCH /api/form3cd/:reportId/bulk — bulk update multiple clauses
router.patch('/:reportId/bulk', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireReportAccess(req, res, String(req.params.reportId)))) return;
    const updates: { id: string; response?: string; remarks?: string; isApplicable?: boolean; isCompleted?: boolean }[] = req.body.clauses;
    if (!Array.isArray(updates)) { res.status(400).json({ error: 'clauses array required' }); return; }

    // Constrain each update to clauses belonging to this report (prevents cross-report writes)
    await Promise.all(updates.map(u =>
      prisma.form3CDClause.updateMany({
        where: { id: u.id, reportId: req.params.reportId },
        data: {
          ...(u.response !== undefined && { response: u.response }),
          ...(u.remarks !== undefined && { remarks: u.remarks }),
          ...(u.isApplicable !== undefined && { isApplicable: u.isApplicable }),
          ...(u.isCompleted !== undefined && { isCompleted: u.isCompleted }),
        },
      })
    ));

    const clauses = await prisma.form3CDClause.findMany({
      where: { reportId: req.params.reportId },
      orderBy: { clauseNumber: 'asc' },
    });
    res.json(clauses);
  } catch (err) {
    logger.error('Bulk update Form 3CD error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to bulk update clauses' });
  }
});

export default router;
