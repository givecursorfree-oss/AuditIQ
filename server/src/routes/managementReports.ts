import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);
// All management reports are Partner-only
router.use(authorize('Partner', 'Admin'));

/**
 * Standard Indian statutory due-dates (recurring).
 * Returned with computed next occurrence and RAG status.
 */
function nextOccurrence(monthly: { day: number; month?: number }): Date {
  const today = new Date();
  const candidate = new Date(today.getFullYear(), monthly.month ?? today.getMonth(), monthly.day);
  if (candidate < today) {
    // bump to next month/year
    if (monthly.month !== undefined) candidate.setFullYear(candidate.getFullYear() + 1);
    else candidate.setMonth(candidate.getMonth() + 1);
  }
  return candidate;
}

function rag(days: number): 'red' | 'amber' | 'green' {
  if (days < 3) return 'red';
  if (days <= 7) return 'amber';
  return 'green';
}

const STATUTORY_DEADLINES = [
  { key: 'GSTR-1', title: 'GSTR-1 (Monthly outward supplies)', day: 11 },
  { key: 'GSTR-3B', title: 'GSTR-3B (Monthly summary return)', day: 20 },
  { key: 'TDS-Challan', title: 'TDS Challan deposit', day: 7 },
  { key: 'TDS-Return-Q1', title: 'TDS Return Q1', day: 31, month: 6 }, // 31 July
  { key: 'TDS-Return-Q2', title: 'TDS Return Q2', day: 31, month: 9 }, // 31 Oct
  { key: 'TDS-Return-Q3', title: 'TDS Return Q3', day: 31, month: 0 }, // 31 Jan
  { key: 'TDS-Return-Q4', title: 'TDS Return Q4', day: 31, month: 4 }, // 31 May
  { key: 'ITR-NonAudit', title: 'ITR filing (non-audit assessees)', day: 31, month: 6 }, // 31 Jul
  { key: 'ITR-Audit', title: 'ITR filing (audit assessees)', day: 31, month: 9 }, // 31 Oct
  { key: 'Audit-Report-44AB', title: 'Tax Audit Report (Section 44AB)', day: 30, month: 8 }, // 30 Sep
  { key: 'ROC-AOC4', title: 'ROC AOC-4 (Financial statements)', day: 30, month: 9 }, // 30 Oct
  { key: 'ROC-MGT7', title: 'ROC MGT-7 (Annual return)', day: 29, month: 10 }, // 29 Nov
];

/** GET /api/management-reports/deadline-tracker */
router.get('/deadline-tracker', async (_req, res) => {
  const today = new Date();
  const items = STATUTORY_DEADLINES.map((d) => {
    const due = nextOccurrence({ day: d.day, month: d.month });
    const days = Math.ceil((due.getTime() - today.getTime()) / (24 * 3600 * 1000));
    return { key: d.key, title: d.title, dueDate: due, daysAway: days, rag: rag(days) };
  }).sort((a, b) => a.daysAway - b.daysAway);

  res.json({ today, items });
});

/** GET /api/management-reports/profitability */
router.get('/profitability', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engagements = await prisma.engagement.findMany({
      where: { firmId: req.user!.firmId! },
      include: {
        client: { select: { id: true, name: true } },
        timeEntries: true,
        invoices: true,
      },
    });
    const rows = engagements.map((e) => {
      const totalHours = e.timeEntries.reduce((s, t) => s + t.hours, 0);
      const billable = e.timeEntries.filter((t) => t.isBillable).reduce((s, t) => s + t.hours, 0);
      const feeBilled = e.invoices.reduce((s, i) => s + i.totalAmount, 0);
      const feeCollected = e.invoices.reduce((s, i) => s + i.paidAmount, 0);
      const rate = totalHours > 0 ? feeBilled / totalHours : 0;
      return {
        engagementId: e.id,
        title: e.title,
        clientId: e.clientId,
        clientName: e.client.name,
        type: e.type,
        financialYear: e.financialYear,
        totalHours,
        billableHours: billable,
        feeBilled,
        feeCollected,
        effectiveHourlyRate: Number(rate.toFixed(2)),
      };
    });
    res.json(rows.sort((a, b) => b.feeBilled - a.feeBilled));
  } catch (err) {
    logger.error('Profitability report error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to compute profitability' });
  }
});

/** GET /api/management-reports/billing — billing & collection per client */
router.get('/billing', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { client: { firmId: req.user!.firmId! } },
      include: { client: { select: { id: true, name: true } }, payments: true },
      orderBy: { issueDate: 'desc' },
    });
    res.json(invoices);
  } catch (err) {
    logger.error('Billing report error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load billing data' });
  }
});

/** GET /api/management-reports/staff-productivity?month=YYYY-MM&targetHours=160 */
router.get('/staff-productivity', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const monthStr = String(req.query.month || new Date().toISOString().slice(0, 7));
    const target = Number(req.query.targetHours || 160);
    const [year, month] = monthStr.split('-').map(Number);
    const from = new Date(year, (month || 1) - 1, 1);
    const to = new Date(year, month || 1, 0, 23, 59, 59);

    const users = await prisma.user.findMany({
      where: { firmId: req.user!.firmId!, isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true, designation: true },
    });
    const entries = await prisma.timeEntry.findMany({
      where: {
        user: { firmId: req.user!.firmId! },
        date: { gte: from, lte: to },
      },
    });

    const byUser = new Map<string, { billable: number; nonBillable: number }>();
    for (const e of entries) {
      const r = byUser.get(e.userId) || { billable: 0, nonBillable: 0 };
      if (e.isBillable) r.billable += e.hours;
      else r.nonBillable += e.hours;
      byUser.set(e.userId, r);
    }

    const rows = users.map((u) => {
      const r = byUser.get(u.id) || { billable: 0, nonBillable: 0 };
      const total = r.billable + r.nonBillable;
      const utilisation = total > 0 ? Number(((r.billable / total) * 100).toFixed(1)) : 0;
      return {
        userId: u.id,
        name: `${u.firstName} ${u.lastName}`,
        role: u.role,
        designation: u.designation,
        billableHours: Number(r.billable.toFixed(2)),
        nonBillableHours: Number(r.nonBillable.toFixed(2)),
        totalHours: Number(total.toFixed(2)),
        targetHours: target,
        utilisationPct: utilisation,
        achievedPct: target > 0 ? Number(((r.billable / target) * 100).toFixed(1)) : 0,
      };
    });

    res.json({ month: monthStr, rows: rows.sort((a, b) => b.billableHours - a.billableHours) });
  } catch (err) {
    logger.error('Staff productivity error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to compute productivity' });
  }
});

/**
 * GET /api/management-reports/workload-heatmap?month=YYYY-MM
 * Returns per-user per-day total hours, suitable for a heatmap grid.
 */
router.get('/workload-heatmap', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const monthStr = String(req.query.month || new Date().toISOString().slice(0, 7));
    const [year, month] = monthStr.split('-').map(Number);
    const from = new Date(year, (month || 1) - 1, 1);
    const to = new Date(year, month || 1, 0, 23, 59, 59);

    const entries = await prisma.timeEntry.findMany({
      where: {
        user: { firmId: req.user!.firmId! },
        date: { gte: from, lte: to },
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    type Cell = { userId: string; userName: string; date: string; hours: number };
    const map = new Map<string, Cell>();
    for (const e of entries) {
      const dateStr = e.date.toISOString().slice(0, 10);
      const key = `${e.userId}|${dateStr}`;
      const cell = map.get(key) || {
        userId: e.userId,
        userName: `${e.user.firstName} ${e.user.lastName}`,
        date: dateStr,
        hours: 0,
      };
      cell.hours += e.hours;
      map.set(key, cell);
    }
    res.json({ month: monthStr, cells: Array.from(map.values()) });
  } catch (err) {
    logger.error('Heatmap error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to build heatmap' });
  }
});

export default router;
