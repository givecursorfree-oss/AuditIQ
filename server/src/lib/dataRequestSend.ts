import { getEnv } from './env.js';
import {
  collectTeamCcEmails,
  formatCcList,
  isDataRequestCategory,
} from './dataRequestMail.js';
import { getEngagementTeamEmails } from './engagementTeam.js';

/** Build CC + teamUserIds for a data-request send on an engagement. */
export async function buildDataRequestTeamCc(opts: {
  category: string;
  engagementId?: string | null;
  toAddress: string;
}): Promise<{ cc?: string; teamUserIds?: string[] }> {
  if (!isDataRequestCategory(opts.category) || !opts.engagementId) {
    return {};
  }
  const env = getEnv();
  const { emails, userIds } = await getEngagementTeamEmails(opts.engagementId);
  const ccList = collectTeamCcEmails(emails, {
    exclude: [opts.toAddress, env.SMTP_USER, env.SMTP_FROM],
  });
  return {
    cc: formatCcList(ccList),
    teamUserIds: userIds.length ? userIds : undefined,
  };
}
