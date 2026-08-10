import prisma from './prisma.js';
import { isPrivilegedRole } from './permissions.js';
import { canAccessEngagement } from './engagementAccess.js';

export type DocumentVisibility = 'ENGAGEMENT' | 'FIRM';

/** Portal clients only see their uploads — not staff working papers. */
export function clientPortalDocumentWhere(clientId: string, engagementId?: string) {
  return {
    engagement: {
      clientId,
      ...(engagementId ? { id: engagementId } : {}),
    },
    OR: [{ folder: 'Client Upload' }, { uploadedBy: { role: 'Client' as const } }],
  };
}

/** Engagement IDs the user may access (membership or privileged). */
export async function getAccessibleEngagementIds(
  userId: string,
  role: string,
  firmId: string | null
): Promise<string[]> {
  if (isPrivilegedRole(role)) {
    if (!firmId) return [];
    const engagements = await prisma.engagement.findMany({
      where: { firmId },
      select: { id: true },
    });
    return engagements.map((e) => e.id);
  }

  const engagements = await prisma.engagement.findMany({
    where: {
      ...(firmId ? { firmId } : {}),
      OR: [
        { members: { some: { userId } } },
        { partnerInChargeId: userId },
        { managerId: userId },
        { articleAssistantId: userId },
      ],
    },
    select: { id: true },
  });
  return engagements.map((e) => e.id);
}

/** Prisma where clause for documents visible to this user. */
export async function buildDocumentAccessWhere(
  userId: string,
  role: string,
  firmId: string | null
): Promise<Record<string, unknown>> {
  if (!firmId) {
    return { uploadedById: userId };
  }

  const engagementIds = await getAccessibleEngagementIds(userId, role, firmId);

  return {
    firmId,
    OR: [
      { visibility: 'FIRM' },
      ...(engagementIds.length > 0 ? [{ engagementId: { in: engagementIds } }] : []),
      { uploadedById: userId },
    ],
  };
}

export async function canAccessDocument(
  userId: string,
  role: string,
  firmId: string | null,
  document: {
    firmId: string | null;
    visibility: string;
    engagementId: string | null;
    uploadedById: string;
  }
): Promise<boolean> {
  if (document.uploadedById === userId) return true;
  if (!firmId || document.firmId !== firmId) return false;
  if (document.visibility === 'FIRM') return true;
  if (!document.engagementId) return false;

  if (isPrivilegedRole(role)) return true;

  return canAccessEngagement(userId, role, firmId, document.engagementId);
}

export function canMutateDocument(
  userId: string,
  role: string,
  document: { uploadedById: string }
): boolean {
  return document.uploadedById === userId || isPrivilegedRole(role);
}
