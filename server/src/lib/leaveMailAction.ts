import jwt from 'jsonwebtoken';
import { getEnv } from './env.js';
import { apiPublicOrigin, mailCtaRow } from './mailCta.js';

export type LeaveMailAction = 'open' | 'approve' | 'reject';

const PURPOSE = 'leave-mail-action';
const TOKEN_TTL = '7d';

type LeaveMailPayload = {
  purpose: typeof PURPOSE;
  leaveId: string;
  userId: string;
  action: LeaveMailAction;
};

export { apiPublicOrigin };

export function signLeaveMailToken(input: {
  leaveId: string;
  userId: string;
  action: LeaveMailAction;
}): string {
  return jwt.sign(
    {
      purpose: PURPOSE,
      leaveId: input.leaveId,
      userId: input.userId,
      action: input.action,
    } satisfies LeaveMailPayload,
    getEnv().JWT_SECRET,
    { expiresIn: TOKEN_TTL, algorithm: 'HS256' }
  );
}

export function verifyLeaveMailToken(token: string): LeaveMailPayload | null {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (
      payload.purpose !== PURPOSE ||
      typeof payload.leaveId !== 'string' ||
      typeof payload.userId !== 'string' ||
      (payload.action !== 'open' && payload.action !== 'approve' && payload.action !== 'reject')
    ) {
      return null;
    }
    return {
      purpose: PURPOSE,
      leaveId: payload.leaveId,
      userId: payload.userId,
      action: payload.action,
    };
  } catch {
    return null;
  }
}

export function leaveMailActionUrl(input: {
  leaveId: string;
  userId: string;
  action: LeaveMailAction;
}): string {
  const token = signLeaveMailToken(input);
  return `${apiPublicOrigin()}/api/leave-mail/action?token=${encodeURIComponent(token)}`;
}

export function leaveMailActionButtonsHtml(input: {
  leaveId: string;
  userId: string;
  /** When false, only the Open button is included. Default true. */
  includeDecide?: boolean;
}): string {
  const open = leaveMailActionUrl({ ...input, action: 'open' });
  if (input.includeDecide === false) {
    return mailCtaRow([{ href: open, label: 'Open', bg: '#2563eb' }]);
  }
  const approve = leaveMailActionUrl({ ...input, action: 'approve' });
  const reject = leaveMailActionUrl({ ...input, action: 'reject' });
  return mailCtaRow([
    { href: open, label: 'Open', bg: '#2563eb' },
    { href: approve, label: 'Approve', bg: '#16a34a' },
    { href: reject, label: 'Reject', bg: '#dc2626' },
  ]);
}
