import jwt from 'jsonwebtoken';
import prisma from './prisma.js';
import { getEnv } from './env.js';
import logger from './logger.js';
import { sendEmail } from './emailService.js';
import { apiPublicOrigin, mailCtaRow } from './mailCta.js';
import { getAttendanceDateKey } from './attendanceDates.js';
import { isArticleAssistant } from './leaveNotify.js';
import {
  COMP_OFF_HR_CREDITED,
  COMP_OFF_MANAGER_APPROVED,
  COMP_OFF_PENDING,
  COMP_OFF_REJECTED,
  canManagerApproveCompOff,
} from './compOffPolicy.js';

export type CompOffMailAction = 'open' | 'approve' | 'reject';

const PURPOSE = 'comp-off-mail-action';

type Payload = {
  purpose: typeof PURPOSE;
  requestId: string;
  userId: string;
  action: CompOffMailAction;
};

function dateKey(raw: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : getAttendanceDateKey(new Date(raw));
}

export function signCompOffMailToken(input: {
  requestId: string;
  userId: string;
  action: CompOffMailAction;
}): string {
  return jwt.sign(
    { purpose: PURPOSE, ...input } satisfies Payload,
    getEnv().JWT_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
  );
}

export function verifyCompOffMailToken(token: string): Payload | null {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (
      payload.purpose !== PURPOSE ||
      typeof payload.requestId !== 'string' ||
      typeof payload.userId !== 'string' ||
      (payload.action !== 'open' && payload.action !== 'approve' && payload.action !== 'reject')
    ) {
      return null;
    }
    return {
      purpose: PURPOSE,
      requestId: payload.requestId,
      userId: payload.userId,
      action: payload.action,
    };
  } catch {
    return null;
  }
}

function actionUrl(input: { requestId: string; userId: string; action: CompOffMailAction }): string {
  const token = signCompOffMailToken(input);
  return `${apiPublicOrigin()}/api/leave-mail/comp-off?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Article assistant ticked Comp off on the manual time grid.
 * Creates a pending portal request and emails the selected Manager/Partner.
 */
export async function notifyCompOffFromTimeEntry(input: {
  userId: string;
  firmId: string;
  supervisorId: string;
  dateRaw: string;
  clientName: string;
  hours: number;
}): Promise<void> {
  const applicant = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      firstName: true,
      lastName: true,
      designation: true,
      hierarchyLevel: { select: { code: true, title: true } },
      articleship: { select: { id: true } },
    },
  });
  if (!applicant) return;
  if (
    !isArticleAssistant({
      hierarchyCode: applicant.hierarchyLevel?.code,
      hierarchyTitle: applicant.hierarchyLevel?.title,
      designation: applicant.designation,
      hasArticleship: Boolean(applicant.articleship),
    })
  ) {
    return;
  }

  const manager = await prisma.user.findFirst({
    where: { id: input.supervisorId, firmId: input.firmId, isActive: true },
    select: { id: true, email: true, firstName: true, role: true },
  });
  if (!manager || !canManagerApproveCompOff(manager.role)) return;

  const key = dateKey(input.dateRaw);
  const workDate = new Date(`${key}T00:00:00.000Z`);
  const existing = await prisma.compOffRequest.findFirst({
    where: {
      userId: input.userId,
      workDate,
      status: { in: [COMP_OFF_PENDING, COMP_OFF_MANAGER_APPROVED, COMP_OFF_HR_CREDITED] },
    },
    select: { id: true, assignedManagerId: true, status: true },
  });
  if (existing && existing.status !== COMP_OFF_PENDING) return;
  const request = existing
    ? existing.assignedManagerId
      ? existing
      : await prisma.compOffRequest.update({
          where: { id: existing.id },
          data: { assignedManagerId: manager.id },
          select: { id: true, assignedManagerId: true, status: true },
        })
    : await prisma.compOffRequest.create({
        data: {
          firmId: input.firmId,
          userId: input.userId,
          workDate,
          days: 1,
          reason: `Manual time grid · ${input.clientName} · ${input.hours}h`,
          status: COMP_OFF_PENDING,
          assignedManagerId: manager.id,
        },
        select: { id: true, assignedManagerId: true, status: true },
      });
  if (existing?.assignedManagerId) return;

  const name = `${applicant.firstName} ${applicant.lastName}`.trim();
  const title = applicant.hierarchyLevel?.title || applicant.designation || 'Article assistant';
  const buttons = mailCtaRow([
    { href: actionUrl({ requestId: request.id, userId: manager.id, action: 'open' }), label: 'Open', bg: '#2563eb' },
    { href: actionUrl({ requestId: request.id, userId: manager.id, action: 'approve' }), label: 'Approve', bg: '#16a34a' },
    { href: actionUrl({ requestId: request.id, userId: manager.id, action: 'reject' }), label: 'Reject', bg: '#dc2626' },
  ]);
  await sendEmail({
    to: manager.email,
    subject: `Comp off — ${name}`,
    body: `<p>${escapeHtml(name)} (${escapeHtml(title)}) marked Comp off on ${escapeHtml(key)}.</p><p>${escapeHtml(input.clientName)} · ${input.hours} hour(s)</p>${buttons}`,
  });
  logger.info('Comp-off mail sent', { requestId: request.id, to: manager.email });
}

export async function applyCompOffMailDecision(input: {
  requestId: string;
  actorId: string;
  actorRole: string;
  actorFirmId: string | null;
  action: 'approve' | 'reject';
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canManagerApproveCompOff(input.actorRole)) {
    return { ok: false, error: 'Only Manager or Partner can approve comp off' };
  }
  const row = await prisma.compOffRequest.findFirst({
    where: { id: input.requestId, firmId: input.actorFirmId || undefined },
  });
  if (!row) return { ok: false, error: 'Comp-off request not found' };
  if (row.assignedManagerId && row.assignedManagerId !== input.actorId) {
    return { ok: false, error: 'This comp off is assigned to another manager' };
  }
  if (row.status !== COMP_OFF_PENDING) {
    return { ok: false, error: `Comp off is already ${row.status}` };
  }
  if (input.action === 'approve') {
    await prisma.compOffRequest.update({
      where: { id: row.id },
      data: {
        status: COMP_OFF_MANAGER_APPROVED,
        managerApprovedById: input.actorId,
        managerApprovedAt: new Date(),
      },
    });
    return { ok: true };
  }
  await prisma.compOffRequest.update({
    where: { id: row.id },
    data: {
      status: COMP_OFF_REJECTED,
      rejectedById: input.actorId,
      rejectedAt: new Date(),
    },
  });
  return { ok: true };
}
