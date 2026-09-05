import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { getEnv } from '../lib/env.js';
import { validateUploadOrRemove } from '../lib/fileSignature.js';
import { validateAmount, validatePartialAmount } from '../lib/expenseClaimPolicy.js';
import { evaluateFoodLateSittingPolicy } from '../lib/foodClaimPolicy.js';
import { verifyLateHoursClaim } from '../lib/lateHoursPolicy.js';
import { getFingerprintLogoffTime } from '../lib/biometricService.js';
import { logClaimAudit } from '../lib/claimAudit.js';
import { queueClaimReceiptOcr } from '../lib/claimReceiptOcr.js';
import {
  createParticipantsAndApprovals,
  finalizeClaimWithoutManagers,
  recomputeClaimStatus,
  type ParticipantInput,
} from '../lib/claimGroupApproval.js';
import { listLookupValues, LOOKUP_ACTIVITY } from '../lib/hrLookups.js';

const router = Router();
router.use(authenticate);

const uploadDir = path.join(process.cwd(), getEnv().UPLOAD_DIR, 'expense-claims');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: getEnv().MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['.pdf', '.jpg', '.jpeg', '.png'].includes(path.extname(file.originalname).toLowerCase());
    cb(null, ok);
  },
});

const claimInclude = {
  staff: { select: { id: true, firstName: true, lastName: true, email: true } },
  expensePayer: { select: { id: true, firstName: true, lastName: true } },
  client: { select: { id: true, name: true } },
  engagement: { select: { id: true, title: true, serviceCode: true, financialYear: true, type: true } },
  receipts: { select: { id: true, fileName: true, mimeType: true, uploadedAt: true } },
  managerReviewedBy: { select: { firstName: true, lastName: true } },
  participants: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      engagement: { select: { id: true, title: true, serviceCode: true, financialYear: true, type: true } },
      client: { select: { id: true, name: true } },
    },
  },
  managerApprovals: {
    include: {
      manager: { select: { id: true, firstName: true, lastName: true } },
    },
  },
};

function stripOcrForEmployee<T extends { ocrDetectedAmount?: unknown; ocrStatus?: unknown }>(claim: T, role: string): T {
  if (['Partner', 'Admin', 'Manager', 'Accounts'].includes(role)) return claim;
  const { ocrDetectedAmount: _a, ocrStatus: _s, ...rest } = claim as T & Record<string, unknown>;
  return rest as T;
}

async function findFirmClaim(req: AuthRequest, id: string) {
  return prisma.expenseClaim.findFirst({
    where: { id, firmId: req.user!.firmId! },
    include: { receipts: true, participants: true, managerApprovals: true },
  });
}

async function getComputerLogoffTime(userId: string, date: Date): Promise<string | null> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const entry = await prisma.timeEntry.findFirst({
    where: { userId, date: { gte: start, lte: end }, endedAt: { not: null } },
    orderBy: { endedAt: 'desc' },
    select: { endedAt: true },
  });
  if (entry?.endedAt) return entry.endedAt.toTimeString().slice(0, 5);
  const att = await prisma.attendance.findFirst({
    where: { userId, date: start },
    select: { checkOut: true },
  });
  if (att?.checkOut) return new Date(att.checkOut).toTimeString().slice(0, 5);
  return null;
}

async function buildFoodPolicyFlags(staffId: string, expenseDate: Date) {
  const late = await prisma.lateHoursClaim.findFirst({
    where: { staffId, date: expenseDate, status: 'approved' },
    select: { actualEndTime: true },
  });
  const [computerLogoffTime, fingerprintLogoffTime] = await Promise.all([
    getComputerLogoffTime(staffId, expenseDate),
    getFingerprintLogoffTime(staffId, expenseDate),
  ]);
  const endTime = late?.actualEndTime ?? computerLogoffTime;
  const sitting = evaluateFoodLateSittingPolicy(expenseDate, endTime);
  const logoff = endTime
    ? verifyLateHoursClaim({ actualEndTime: endTime, computerLogoffTime, fingerprintLogoffTime })
    : {
        flagged: !computerLogoffTime && !fingerprintLogoffTime,
        flagReason: !computerLogoffTime && !fingerprintLogoffTime
          ? 'No computer or biometric log-off record for this date'
          : null,
        computerMismatchMinutes: null,
        fingerprintMismatchMinutes: null,
      };
  return {
    ...sitting,
    computerLogoffTime,
    fingerprintLogoffTime,
    logoffMismatch: logoff.flagged,
    logoffMismatchReason: logoff.flagReason,
  };
}

const participantSchema = z.object({
  userId: z.string().min(1),
  engagementId: z.string().optional(),
  clientId: z.string().optional(),
  workType: z.string().optional(),
  workTypeOther: z.string().optional(),
  managerId: z.string().optional(),
});

const createSchema = z.object({
  claimType: z.enum(['food', 'travel']),
  amount: z.number().positive(),
  expensePayerId: z.string().optional(),
  engagementId: z.string().optional(),
  clientId: z.string().optional(),
  workType: z.string().optional(),
  workTypeOther: z.string().optional(),
  expenseDate: z.string(),
  description: z.string().optional(),
  /** Claim-level approver; applied to participants that omit managerId. */
  managerId: z.string().optional(),
  participants: z.array(participantSchema).optional(),
});

function canSubmit(role: string) {
  return ['Intern', 'Staff', 'Partner', 'Admin', 'Manager'].includes(role);
}

async function getManagerApprovalForUser(claimId: string, userId: string, role: string) {
  if (['Partner', 'Admin'].includes(role)) return null;
  return prisma.expenseClaimManagerApproval.findFirst({
    where: { claimId, managerId: userId, status: 'pending' },
  });
}

/** POST /api/expense-claims */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!canSubmit(req.user!.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const body = createSchema.parse(req.body);
    const amountErr = validateAmount(body.amount);
    if (amountErr) {
      res.status(400).json({ error: amountErr });
      return;
    }

    const participantRows: ParticipantInput[] =
      body.participants && body.participants.length > 0
        ? body.participants.map((p) => ({
            ...p,
            managerId: p.managerId ?? body.managerId,
          }))
        : [
            {
              userId: req.user!.id,
              engagementId: body.engagementId,
              clientId: body.clientId,
              workType: body.workType,
              workTypeOther: body.workTypeOther,
              managerId: body.managerId,
            },
          ];

    if (body.claimType === 'travel' && !body.description?.trim() && participantRows.length === 1) {
      // travel notes optional
    }

    const isArticleRole = ['Intern', 'Staff'].includes(req.user!.role);
    if (isArticleRole) {
      const missingClient = participantRows.some((p) => !p.clientId && !body.clientId);
      const missingActivity = participantRows.some((p) => !(p.workType ?? body.workType)?.trim());
      const missingManager = participantRows.some((p) => !p.managerId);
      if (missingClient) {
        res.status(400).json({ error: 'Client Name is required' });
        return;
      }
      if (missingActivity) {
        res.status(400).json({ error: 'Activity Classification is required' });
        return;
      }
      if (missingManager) {
        res.status(400).json({ error: 'Manager/Partner is required' });
        return;
      }
    }

    for (const p of participantRows) {
      const user = await prisma.user.findFirst({
        where: { id: p.userId, firmId: req.user!.firmId! },
        select: { id: true },
      });
      if (!user) {
        res.status(400).json({ error: 'Participant not in firm' });
        return;
      }
      if (p.managerId) {
        const mgr = await prisma.user.findFirst({
          where: {
            id: p.managerId,
            firmId: req.user!.firmId!,
            isActive: true,
            role: { in: ['Partner', 'Admin', 'Manager'] },
          },
          select: { id: true },
        });
        if (!mgr) {
          res.status(400).json({ error: 'Manager/Partner must be an active Partner, Admin, or Manager' });
          return;
        }
      }
      if (p.engagementId && p.clientId) {
        const eng = await prisma.engagement.findFirst({
          where: { id: p.engagementId, firmId: req.user!.firmId!, clientId: p.clientId },
        });
        if (!eng) {
          res.status(400).json({ error: 'Participant engagement/client mismatch' });
          return;
        }
      }
      if (p.clientId && !p.engagementId) {
        const client = await prisma.client.findFirst({
          where: { id: p.clientId, firmId: req.user!.firmId! },
          select: { id: true },
        });
        if (!client) {
          res.status(400).json({ error: 'Client not in firm' });
          return;
        }
      }
    }

    const expenseDate = new Date(body.expenseDate);
    const payerId = body.expensePayerId ?? req.user!.id;
    const payerOk = await prisma.user.findFirst({
      where: { id: payerId, firmId: req.user!.firmId! },
      select: { id: true },
    });
    if (!payerOk) {
      res.status(400).json({ error: 'Expense payer not in firm' });
      return;
    }
    const headerEng = body.engagementId ?? participantRows[0]?.engagementId;
    const headerClient = body.clientId ?? participantRows[0]?.clientId;
    const headerWork = body.workType ?? participantRows[0]?.workType ?? (body.claimType === 'travel' ? 'Travel' : 'Food');

    let policyFlags: Record<string, unknown> | undefined;
    if (body.claimType === 'food') {
      const coveredIds = [...new Set(participantRows.map((p) => p.userId))];
      const perPerson = await Promise.all(
        coveredIds.map(async (uid) => ({ userId: uid, ...(await buildFoodPolicyFlags(uid, expenseDate)) }))
      );
      const payerFlags = await buildFoodPolicyFlags(payerId, expenseDate);
      policyFlags = {
        ...payerFlags,
        people: perPerson,
        lateSittingException:
          perPerson.some((f) => f.lateSittingException) || !!payerFlags.lateSittingException,
        lateSittingReason:
          perPerson.find((f) => f.lateSittingReason)?.lateSittingReason ?? payerFlags.lateSittingReason,
        logoffMismatch: perPerson.some((f) => f.logoffMismatch) || !!payerFlags.logoffMismatch,
        logoffMismatchReason:
          perPerson.find((f) => f.logoffMismatchReason)?.logoffMismatchReason ??
          payerFlags.logoffMismatchReason,
      };
    }

    const claim = await prisma.expenseClaim.create({
      data: {
        firmId: req.user!.firmId!,
        staffId: req.user!.id,
        expensePayerId: payerId,
        claimType: body.claimType,
        expenseDate,
        amount: body.amount,
        engagementId: headerEng,
        clientId: headerClient,
        workType: headerWork,
        workTypeOther: body.workTypeOther ?? participantRows[0]?.workTypeOther,
        description: body.description,
        policyFlags: policyFlags != null ? (policyFlags as Prisma.InputJsonValue) : undefined,
        participantCount: participantRows.length,
        claimStatus: 'pending_approval',
        processingStatus: 'unprocessed',
        ocrStatus: 'pending',
      },
      include: claimInclude,
    });

    await createParticipantsAndApprovals(claim.id, body.amount, participantRows);
    await logClaimAudit(claim.id, 'submitted', req.user!.id, {
      claimType: body.claimType,
      amount: body.amount,
      participantCount: participantRows.length,
    });

    const full = await prisma.expenseClaim.findUnique({ where: { id: claim.id }, include: claimInclude });
    res.status(201).json(stripOcrForEmployee(full!, req.user!.role));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Create claim error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create claim' });
  }
});

router.post('/:id/receipts', upload.array('files', 10), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const claim = await findFirmClaim(req, String(req.params.id));
    if (!claim) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }
    if (claim.staffId !== req.user!.id && !['Partner', 'Admin'].includes(req.user!.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (claim.claimStatus !== 'pending_approval') {
      res.status(400).json({ error: 'Claim is not editable' });
      return;
    }
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }
    const created = [];
    for (const file of files) {
      const sigErr = validateUploadOrRemove(file.path, file.originalname);
      if (sigErr) {
        res.status(400).json({ error: sigErr });
        return;
      }
      created.push(
        await prisma.expenseClaimReceipt.create({
          data: {
            expenseClaimId: claim.id,
            fileName: file.originalname,
            storagePath: file.path,
            mimeType: file.mimetype,
          },
        })
      );
    }
    await prisma.expenseClaim.update({ where: { id: claim.id }, data: { ocrStatus: 'pending' } });
    queueClaimReceiptOcr(claim.id);
    res.status(201).json({ receipts: created });
  } catch {
    res.status(500).json({ error: 'Failed to upload receipts' });
  }
});

router.post('/:id/reocr', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const claim = await findFirmClaim(req, String(req.params.id));
    if (!claim) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }
    if (claim.receipts.length === 0) {
      res.status(400).json({ error: 'No receipts' });
      return;
    }
    await prisma.expenseClaim.update({ where: { id: claim.id }, data: { ocrStatus: 'pending' } });
    queueClaimReceiptOcr(claim.id);
    res.json({ ok: true, ocrStatus: 'pending' });
  } catch {
    res.status(500).json({ error: 'Failed to re-run OCR' });
  }
});

router.get('/receipts/:receiptId/download', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const receipt = await prisma.expenseClaimReceipt.findFirst({
      where: { id: String(req.params.receiptId), expenseClaim: { firmId: req.user!.firmId! } },
      include: { expenseClaim: { select: { id: true, staffId: true, expensePayerId: true } } },
    });
    if (!receipt) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const role = req.user!.role;
    const ok =
      receipt.expenseClaim.staffId === req.user!.id ||
      receipt.expenseClaim.expensePayerId === req.user!.id ||
      ['Partner', 'Admin', 'Manager', 'Accounts'].includes(role) ||
      (await prisma.expenseClaimParticipant.findFirst({
        where: { claimId: receipt.expenseClaim.id, userId: req.user!.id },
        select: { id: true },
      })) != null;
    if (!ok) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (!fs.existsSync(receipt.storagePath)) {
      res.status(404).json({ error: 'File missing' });
      return;
    }
    res.download(path.resolve(receipt.storagePath), receipt.fileName);
  } catch {
    res.status(500).json({ error: 'Download failed' });
  }
});

router.get('/mine', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!canSubmit(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const claims = await prisma.expenseClaim.findMany({
    where: {
      firmId: req.user!.firmId!,
      OR: [
        { staffId: req.user!.id },
        { expensePayerId: req.user!.id },
        { participants: { some: { userId: req.user!.id } } },
      ],
    },
    include: claimInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ claims: claims.map((c) => stripOcrForEmployee(c, req.user!.role)) });
});

/** DELETE /api/expense-claims/:id — submitter rollback when no receipts (orphan after failed upload) */
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const claim = await findFirmClaim(req, String(req.params.id));
    if (!claim || claim.staffId !== req.user!.id) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }
    if (claim.claimStatus !== 'pending_approval' || claim.receipts.length > 0) {
      res.status(400).json({ error: 'Only pending claims without receipts can be deleted' });
      return;
    }
    await prisma.expenseClaimManagerApproval.deleteMany({ where: { claimId: claim.id } });
    await prisma.expenseClaimParticipant.deleteMany({ where: { claimId: claim.id } });
    await prisma.expenseClaim.delete({ where: { id: claim.id } });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete claim error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete claim' });
  }
});

router.get('/pending', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response) => {
  const role = req.user!.role;
  const where =
    role === 'Manager'
      ? {
          firmId: req.user!.firmId!,
          claimStatus: { in: ['pending_approval', 'partially_approved'] },
          managerApprovals: { some: { managerId: req.user!.id, status: 'pending' } },
        }
      : {
          firmId: req.user!.firmId!,
          claimStatus: { in: ['pending_approval', 'partially_approved'] },
        };

  const claims = await prisma.expenseClaim.findMany({
    where,
    include: claimInclude,
    orderBy: { submittedAt: 'asc' },
  });
  res.json({ claims });
});

router.get('/approved', authorize('Partner', 'Admin', 'Manager', 'Accounts'), async (req: AuthRequest, res: Response) => {
  const claims = await prisma.expenseClaim.findMany({
    where: {
      firmId: req.user!.firmId!,
      claimStatus: { in: ['approved', 'partially_approved'] },
      processingStatus: 'unprocessed',
    },
    include: claimInclude,
    orderBy: { managerReviewedAt: 'asc' },
  });
  res.json({ claims });
});

router.patch('/:id/approve', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response) => {
  const existing = await findFirmClaim(req, String(req.params.id));
  if (!existing || !['pending_approval', 'partially_approved'].includes(existing.claimStatus)) {
    res.status(400).json({ error: 'Claim not pending' });
    return;
  }
  if (existing.receipts.length === 0) {
    res.status(400).json({ error: 'Receipt required' });
    return;
  }

  const role = req.user!.role;
  if (role === 'Manager') {
    const approval = await getManagerApprovalForUser(existing.id, req.user!.id, role);
    if (!approval) {
      res.status(403).json({ error: 'No pending approval for you' });
      return;
    }
    await prisma.expenseClaimManagerApproval.update({
      where: { id: approval.id },
      data: {
        status: 'approved',
        approvedAmount: approval.teamAmount,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
      },
    });
    await recomputeClaimStatus(existing.id);
    await logClaimAudit(existing.id, 'approved', req.user!.id, { managerId: req.user!.id });
  } else {
    const approvalCount = await prisma.expenseClaimManagerApproval.count({ where: { claimId: existing.id } });
    if (approvalCount === 0) {
      await finalizeClaimWithoutManagers(existing.id, req.user!.id, {
        approvedAmount: Number(existing.amount),
        status: 'approved',
      });
    } else {
      await prisma.expenseClaimManagerApproval.updateMany({
        where: { claimId: existing.id, status: 'pending' },
        data: {
          status: 'approved',
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
        },
      });
      const approvals = await prisma.expenseClaimManagerApproval.findMany({ where: { claimId: existing.id } });
      for (const a of approvals) {
        if (a.approvedAmount == null) {
          await prisma.expenseClaimManagerApproval.update({
            where: { id: a.id },
            data: { approvedAmount: a.teamAmount },
          });
        }
      }
      await recomputeClaimStatus(existing.id);
    }
    await logClaimAudit(existing.id, 'approved', req.user!.id, { override: true });
  }

  const claim = await prisma.expenseClaim.findUnique({ where: { id: existing.id }, include: claimInclude });
  res.json(claim);
});

router.patch('/:id/reject', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response) => {
  const body = z.object({ reason: z.string().min(1) }).parse(req.body);
  const existing = await findFirmClaim(req, String(req.params.id));
  if (!existing || !['pending_approval', 'partially_approved'].includes(existing.claimStatus)) {
    res.status(400).json({ error: 'Claim not pending' });
    return;
  }

  const role = req.user!.role;
  if (role === 'Manager') {
    const approval = await getManagerApprovalForUser(existing.id, req.user!.id, role);
    if (!approval) {
      res.status(403).json({ error: 'No pending approval for you' });
      return;
    }
    await prisma.expenseClaimManagerApproval.update({
      where: { id: approval.id },
      data: {
        status: 'rejected',
        rejectReasonInternal: body.reason,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
      },
    });
    await recomputeClaimStatus(existing.id);
  } else {
    await prisma.expenseClaim.update({
      where: { id: existing.id },
      data: {
        claimStatus: 'rejected',
        rejectReasonInternal: body.reason,
        managerReviewedById: req.user!.id,
        managerReviewedAt: new Date(),
      },
    });
    await prisma.expenseClaimManagerApproval.updateMany({
      where: { claimId: existing.id },
      data: { status: 'rejected', rejectReasonInternal: body.reason },
    });
  }
  await logClaimAudit(existing.id, 'rejected', req.user!.id, { reason: body.reason });
  const claim = await prisma.expenseClaim.findUnique({ where: { id: existing.id }, include: claimInclude });
  res.json(claim);
});

router.patch('/:id/partial-approve', authorize('Partner', 'Admin', 'Manager'), async (req: AuthRequest, res: Response) => {
  const body = z.object({ approvedAmount: z.number().positive(), reason: z.string().min(1) }).parse(req.body);
  const existing = await findFirmClaim(req, String(req.params.id));
  if (!existing || !['pending_approval', 'partially_approved'].includes(existing.claimStatus)) {
    res.status(400).json({ error: 'Claim not pending' });
    return;
  }
  if (existing.receipts.length === 0) {
    res.status(400).json({ error: 'Receipt required' });
    return;
  }

  const role = req.user!.role;
  if (role === 'Manager') {
    const approval = await getManagerApprovalForUser(existing.id, req.user!.id, role);
    if (!approval) {
      res.status(403).json({ error: 'No pending approval for you' });
      return;
    }
    const partialErr = validatePartialAmount(Number(approval.teamAmount), body.approvedAmount);
    if (partialErr) {
      res.status(400).json({ error: partialErr });
      return;
    }
    await prisma.expenseClaimManagerApproval.update({
      where: { id: approval.id },
      data: {
        status: 'partially_approved',
        approvedAmount: body.approvedAmount,
        partialApproveReason: body.reason,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
      },
    });
    await recomputeClaimStatus(existing.id);
    await logClaimAudit(existing.id, 'partially_approved', req.user!.id, {
      managerId: req.user!.id,
      approved: body.approvedAmount,
      reason: body.reason,
    });
  } else {
    const partialErr = validatePartialAmount(Number(existing.amount), body.approvedAmount);
    if (partialErr) {
      res.status(400).json({ error: partialErr });
      return;
    }
    const approvalCount = await prisma.expenseClaimManagerApproval.count({ where: { claimId: existing.id } });
    if (approvalCount === 0) {
      await finalizeClaimWithoutManagers(existing.id, req.user!.id, {
        approvedAmount: body.approvedAmount,
        status: 'partially_approved',
        reason: body.reason,
      });
    } else {
      // Mark all pending manager rows as partially_approved proportionally to team share
      const pending = await prisma.expenseClaimManagerApproval.findMany({
        where: { claimId: existing.id, status: 'pending' },
      });
      const pendingSum = pending.reduce((s, a) => s + Number(a.teamAmount), 0) || Number(existing.amount);
      for (const a of pending) {
        const slice =
          Math.round((body.approvedAmount * (Number(a.teamAmount) / pendingSum)) * 100) / 100;
        await prisma.expenseClaimManagerApproval.update({
          where: { id: a.id },
          data: {
            status: 'partially_approved',
            approvedAmount: slice,
            partialApproveReason: body.reason,
            reviewedById: req.user!.id,
            reviewedAt: new Date(),
          },
        });
      }
      await recomputeClaimStatus(existing.id);
    }
    await logClaimAudit(existing.id, 'partially_approved', req.user!.id, {
      claimed: existing.amount,
      approved: body.approvedAmount,
      reason: body.reason,
    });
    const claim = await prisma.expenseClaim.findUnique({ where: { id: existing.id }, include: claimInclude });
    res.json(claim);
    return;
  }

  const claim = await prisma.expenseClaim.findUnique({ where: { id: existing.id }, include: claimInclude });
  res.json(claim);
});

router.get('/meta/work-types', async (req: AuthRequest, res: Response) => {
  const firmId = req.user?.firmId;
  const fallback = ['Audit', 'GST Return', 'IT Return', 'Stat Audit', 'Consultation', 'Internal', 'Travel', 'Other'];
  let activities = fallback;
  if (firmId) {
    const fromLookup = await listLookupValues(firmId, LOOKUP_ACTIVITY);
    if (fromLookup.length > 0) activities = fromLookup;
  }
  res.json({
    workTypes: fallback,
    activityClassifications: activities,
  });
});

router.get('/meta/staff', authorize('Partner', 'Admin', 'Manager', 'Staff', 'Intern'), async (req: AuthRequest, res: Response) => {
  const staff = await prisma.user.findMany({
    where: { firmId: req.user!.firmId!, isActive: true, role: { in: ['Intern', 'Staff', 'Manager'] } },
    select: { id: true, firstName: true, lastName: true, reportsToId: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  res.json({ staff });
});

/** Clients + Manager/Partner list for claim forms (Articles / Staff). */
router.get('/meta/form-options', authorize('Partner', 'Admin', 'Manager', 'Staff', 'Intern'), async (req: AuthRequest, res: Response) => {
  const firmId = req.user!.firmId!;
  const [clients, approvers, activities] = await Promise.all([
    prisma.client.findMany({
      where: { firmId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    prisma.user.findMany({
      where: { firmId, isActive: true, role: { in: ['Partner', 'Admin', 'Manager'] } },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
    }),
    listLookupValues(firmId, LOOKUP_ACTIVITY),
  ]);
  const fallback = ['Audit', 'GST Return', 'IT Return', 'Stat Audit', 'Consultation', 'Internal', 'Travel', 'Other'];
  res.json({
    clients,
    approvers,
    activityClassifications: activities.length > 0 ? activities : fallback,
  });
});

export default router;

