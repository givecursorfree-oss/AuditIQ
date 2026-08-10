import { getEnv } from './env.js';

/**
 * When SMTP is not configured (or SKIP_EMAIL_VERIFICATION=true), clients can
 * register and log in without clicking an email link.
 */
export function isEmailVerificationRequired(): boolean {
  const env = getEnv();
  if (env.SKIP_EMAIL_VERIFICATION === true) return false;
  if (env.SKIP_EMAIL_VERIFICATION === false) return true;
  return Boolean(env.SMTP_HOST);
}
