import { Prisma } from '@prisma/client';
import prisma from './prisma.js';

export async function logClaimAudit(
  claimId: string,
  action: string,
  actorId: string | null,
  details?: Record<string, unknown>,
  batchId?: string | null
): Promise<void> {
  await prisma.claimAuditEvent.create({
    data: {
      claimId,
      batchId: batchId ?? undefined,
      actorId: actorId ?? undefined,
      action,
      details: details != null ? (details as Prisma.InputJsonValue) : undefined,
    },
  });
}
