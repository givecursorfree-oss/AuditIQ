import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { getEnv } from '../lib/env.js';
import logger from '../lib/logger.js';
import { generateToken, hashToken } from '../lib/authSecurity.js';
import { setTokensCookie } from '../lib/sessionCookies.js';
import { clientIp } from '../lib/clientIp.js';
import { verifyLeaveMailToken } from '../lib/leaveMailAction.js';
import {
  applyLeaveDecision,
  canManagerApproveLeave,
  resolveEmailApproveStatus,
} from '../lib/leaveDecision.js';

const router = Router();

async function establishSession(req: Request, res: Response, userId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true, email: true, role: true, firmId: true },
  });
  if (!user) return false;

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, firmId: user.firmId },
    getEnv().JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = generateToken();
  const staffRoles = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern', 'HR'];
  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshTokenHash: hashToken(refreshToken),
      refreshToken: null,
      sessionStartedAt: new Date(),
      ...(staffRoles.includes(user.role)
        ? { presenceStatus: 'online', presenceUpdatedAt: new Date() }
        : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      action: 'LOGIN_LEAVE_MAIL',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
      ipAddress: clientIp(req),
    },
  });
  setTokensCookie(res, token, refreshToken);
  return true;
}

function redirectLeavePage(res: Response, query: Record<string, string>): void {
  const base = getEnv().CLIENT_URL.replace(/\/$/, '');
  const params = new URLSearchParams({ tab: 'inbox', ...query });
  res.redirect(302, `${base}/leave-stipend?${params.toString()}`);
}

function htmlPage(title: string, message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title></head><body style="font-family:sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem"><h1 style="font-size:1.25rem">${title}</h1><p>${message}</p></body></html>`;
}

/** GET /api/leave-mail/action?token= — Open / Approve / Reject from leave notification email. */
router.get('/action', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = String(req.query.token || '');
    const payload = verifyLeaveMailToken(token);
    if (!payload) {
      res.status(400).type('html').send(htmlPage('Link expired', 'This leave link is invalid or has expired. Sign in to AuditIQ and open Leave Management.'));
      return;
    }

    const actor = await prisma.user.findFirst({
      where: { id: payload.userId, isActive: true },
      select: { id: true, role: true, firmId: true, email: true },
    });
    if (!actor) {
      res.status(403).type('html').send(htmlPage('Account required', 'No active AuditIQ account matches this leave link.'));
      return;
    }

    if (payload.action === 'open') {
      await establishSession(req, res, actor.id);
      redirectLeavePage(res, { leaveId: payload.leaveId });
      return;
    }

    if (!canManagerApproveLeave(actor.role)) {
      await establishSession(req, res, actor.id);
      redirectLeavePage(res, { leaveId: payload.leaveId, mailError: 'no-permission' });
      return;
    }

    const leave = await prisma.leaveRequest.findUnique({
      where: { id: payload.leaveId },
      select: { id: true, status: true },
    });
    if (!leave) {
      res.status(404).type('html').send(htmlPage('Not found', 'This leave request no longer exists.'));
      return;
    }

    if (payload.action === 'approve') {
      const status = resolveEmailApproveStatus(actor.role, leave.status);
      if (!status) {
        await establishSession(req, res, actor.id);
        redirectLeavePage(res, { leaveId: leave.id, mailError: 'cannot-approve' });
        return;
      }
      const result = await applyLeaveDecision({
        leaveId: leave.id,
        actorId: actor.id,
        actorRole: actor.role,
        actorFirmId: actor.firmId,
        status,
      });
      if (!result.ok) {
        await establishSession(req, res, actor.id);
        redirectLeavePage(res, { leaveId: leave.id, mailError: 'action-failed' });
        return;
      }
      await establishSession(req, res, actor.id);
      redirectLeavePage(res, {
        leaveId: leave.id,
        mailDone: status === 'Approved' ? 'approved' : 'manager-approved',
      });
      return;
    }

    // reject
    const result = await applyLeaveDecision({
      leaveId: leave.id,
      actorId: actor.id,
      actorRole: actor.role,
      actorFirmId: actor.firmId,
      status: 'Rejected',
    });
    if (!result.ok) {
      await establishSession(req, res, actor.id);
      redirectLeavePage(res, { leaveId: leave.id, mailError: 'action-failed' });
      return;
    }
    await establishSession(req, res, actor.id);
    redirectLeavePage(res, { leaveId: leave.id, mailDone: 'rejected' });
  } catch (err) {
    logger.error('Leave mail action error', { error: (err as Error).message });
    res.status(500).type('html').send(htmlPage('Error', 'Could not process this leave link. Try again from AuditIQ.'));
  }
});

export default router;
