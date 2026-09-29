import prisma from './prisma.js';
import logger from './logger.js';

export async function writeAuditLog(input: {
  userId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? undefined,
        details: input.details ? JSON.stringify(input.details) : undefined,
        ipAddress: input.ipAddress ?? undefined,
      },
    });
  } catch (err) {
    logger.warn('Audit log write failed', { error: (err as Error).message, action: input.action });
  }
}
