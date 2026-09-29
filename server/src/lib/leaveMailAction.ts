import jwt from 'jsonwebtoken';
import { getEnv } from './env.js';

export type LeaveMailAction = 'open' | 'approve' | 'reject';

const PURPOSE = 'leave-mail-action';
const TOKEN_TTL = '7d';

type LeaveMailPayload = {
  purpose: typeof PURPOSE;
  leaveId: string;
  userId: string;
  action: LeaveMailAction;
};

export function apiPublicOrigin(): string {
  const redirect = getEnv().GOOGLE_REDIRECT_URI;
  if (redirect) {
    try {
      return new URL(redirect).origin;
    } catch {
      /* fall through */
    }
  }
  return `http://localhost:${getEnv().PORT}`;
}

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
  const btn = (href: string, label: string, bg: string) =>
    `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 18px;background:${bg};color:#fff;text-decoration:none;border-radius:4px;font-family:sans-serif;font-size:14px;font-weight:600">${label}</a>`;
  if (input.includeDecide === false) {
    return `<p style="margin:20px 0 8px">${btn(open, 'Open', '#2563eb')}</p>`;
  }
  const approve = leaveMailActionUrl({ ...input, action: 'approve' });
  const reject = leaveMailActionUrl({ ...input, action: 'reject' });
  return `<p style="margin:20px 0 8px">${btn(open, 'Open', '#2563eb')}${btn(approve, 'Approve', '#16a34a')}${btn(reject, 'Reject', '#dc2626')}</p>`;
}
