import { z } from 'zod';
import prisma from './prisma.js';
import { sendEmail } from './emailService.js';
import { listAccessibleEngagementIds } from './engagementAccess.js';
import logger from './logger.js';

export const createClientAuditQuerySchema = z.object({
  engagementId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

export const reportQueryBodySchema = z.object({
  query: z.string().trim().min(1).max(5000).optional(),
  message: z.string().trim().min(1).max(5000).optional(),
}).refine((d) => Boolean(d.query || d.message), {
  message: 'Query text is required',
});

export function staffEngagementQueriesLink(engagementId: string): string {
  return `/engagements/${engagementId}?tab=queries`;
}

export function clientPortalQueriesLink(): string {
  return '/client/dashboard?tab=queries';
}

export function isReportDerivedQuery(subject: string): boolean {
  return subject.startsWith('Query on report:');
}

export async function logClientQueryAudit(params: {
  userId: string;
  action: string;
  entityId: string;
  details: string;
  ipAddress?: string;
}): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: 'ClientAuditQuery',
        entityId: params.entityId,
        details: params.details,
        ipAddress: params.ipAddress,
      },
    })
    .catch((err) => {
      logger.warn('Client audit query audit-log write failed', { error: (err as Error).message });
    });
}

export async function notifyStaffOfNewClientQuery(params: {
  engagementId: string;
  partnerInChargeId: string | null;
  managerId: string | null;
  clientName: string | null;
  subject: string;
  bodyPreview: string;
}): Promise<void> {
  const notifyIds = [params.partnerInChargeId, params.managerId].filter(Boolean) as string[];
  if (notifyIds.length > 0) {
    await prisma.notification
      .createMany({
        data: notifyIds.map((userId) => ({
          userId,
          title: 'New audit query',
          message: `${params.clientName || 'Client'}: ${params.subject}`,
          type: 'info' as const,
          link: staffEngagementQueriesLink(params.engagementId),
        })),
      })
      .catch(() => {});
  }

  const staffUsers = await prisma.user.findMany({
    where: { id: { in: notifyIds }, isActive: true },
    select: { email: true, firstName: true },
  });

  await Promise.all(
    staffUsers.map((u) =>
      sendEmail({
        to: u.email,
        subject: `New client audit query: ${params.subject}`,
        body: `<p><strong>${params.clientName || 'A client'}</strong> submitted an audit query.</p><p><strong>${params.subject}</strong></p><p>${params.bodyPreview.slice(0, 500)}</p>`,
        engagementId: params.engagementId,
        templateKey: 'client-query-new',
      }).catch(() => {})
    )
  );
}

export async function notifyClientOfQueryUpdate(params: {
  clientUserId: string;
  clientEmail: string;
  subject: string;
  title: string;
  message: string;
}): Promise<void> {
  await prisma.notification
    .create({
      data: {
        userId: params.clientUserId,
        title: params.title,
        message: params.message,
        type: 'info' as const,
        link: clientPortalQueriesLink(),
      },
    })
    .catch(() => {});

  await sendEmail({
    to: params.clientEmail,
    subject: params.title,
    body: `<p>${params.message}</p><p>Open the <strong>Audit queries</strong> tab in your portal to read the full response.</p>`,
    templateKey: 'client-query-update',
  }).catch(() => {});
}

/** Prisma where-clause for client audit queries visible to this staff user. */
export async function clientQueryAccessWhere(
  userId: string,
  role: string,
  firmId: string | null
): Promise<{ engagementId: { in: string[] }; engagement: { firmId: string } } | null> {
  if (!firmId) return null;
  const engagementIds = await listAccessibleEngagementIds(userId, role, firmId);
  return {
    engagement: { firmId },
    engagementId: { in: engagementIds },
  };
}
