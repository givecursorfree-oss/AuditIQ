import prisma from './prisma.js';
import { writeAuditLog } from './writeAuditLog.js';

const ARCHIVE_ROLES = new Set(['Partner', 'Admin', 'Manager', 'HR']);

export function canArchiveRecords(role: string): boolean {
  return ARCHIVE_ROLES.has(role);
}

export async function archiveEngagement(opts: {
  engagementId: string;
  firmId: string;
  actorId: string;
  actorRole: string;
  ipAddress?: string | null;
}): Promise<{ ok: true } | { error: string; status: number }> {
  if (!canArchiveRecords(opts.actorRole)) {
    return { error: 'Not allowed to archive engagements', status: 403 };
  }
  const eng = await prisma.engagement.findFirst({
    where: { id: opts.engagementId, firmId: opts.firmId },
  });
  if (!eng) return { error: 'Engagement not found', status: 404 };
  if (eng.archivedAt) return { error: 'Already archived', status: 400 };

  if (opts.actorRole === 'Manager') {
    const assigned =
      eng.managerId === opts.actorId ||
      !!(await prisma.engagementMember.findFirst({
        where: { engagementId: eng.id, userId: opts.actorId, teamRole: 'Manager' },
      }));
    if (!assigned) return { error: 'Managers may only archive assigned engagements', status: 403 };
  }

  await prisma.engagement.update({
    where: { id: eng.id },
    data: {
      archivedAt: new Date(),
      archivedById: opts.actorId,
      restoredAt: null,
      restoredById: null,
    },
  });
  await writeAuditLog({
    userId: opts.actorId,
    action: 'ARCHIVE',
    entity: 'Engagement',
    entityId: eng.id,
    details: { title: eng.title },
    ipAddress: opts.ipAddress,
  });
  return { ok: true };
}

export async function restoreEngagement(opts: {
  engagementId: string;
  firmId: string;
  actorId: string;
  actorRole: string;
  ipAddress?: string | null;
}): Promise<{ ok: true } | { error: string; status: number }> {
  if (!canArchiveRecords(opts.actorRole)) {
    return { error: 'Not allowed to restore engagements', status: 403 };
  }
  const eng = await prisma.engagement.findFirst({
    where: { id: opts.engagementId, firmId: opts.firmId },
  });
  if (!eng) return { error: 'Engagement not found', status: 404 };
  if (!eng.archivedAt) return { error: 'Not archived', status: 400 };

  if (opts.actorRole === 'Manager') {
    const assigned =
      eng.managerId === opts.actorId ||
      eng.archivedById === opts.actorId ||
      !!(await prisma.engagementMember.findFirst({
        where: { engagementId: eng.id, userId: opts.actorId, teamRole: 'Manager' },
      }));
    if (!assigned) return { error: 'Managers may only restore assigned engagements', status: 403 };
  }

  const client = await prisma.client.findFirst({
    where: { id: eng.clientId, firmId: opts.firmId },
    select: { archivedAt: true },
  });
  if (client?.archivedAt) {
    return { error: 'Restore the client before restoring this engagement', status: 400 };
  }

  await prisma.engagement.update({
    where: { id: eng.id },
    data: {
      archivedAt: null,
      archivedById: null,
      restoredAt: new Date(),
      restoredById: opts.actorId,
    },
  });
  await writeAuditLog({
    userId: opts.actorId,
    action: 'RESTORE',
    entity: 'Engagement',
    entityId: eng.id,
    details: { title: eng.title },
    ipAddress: opts.ipAddress,
  });
  return { ok: true };
}

export async function archiveClient(opts: {
  clientId: string;
  firmId: string;
  actorId: string;
  actorRole: string;
  ipAddress?: string | null;
}): Promise<{ ok: true } | { error: string; status: number }> {
  if (!canArchiveRecords(opts.actorRole)) {
    return { error: 'Not allowed to archive clients', status: 403 };
  }
  const client = await prisma.client.findFirst({
    where: { id: opts.clientId, firmId: opts.firmId },
  });
  if (!client) return { error: 'Client not found', status: 404 };
  if (client.archivedAt) return { error: 'Already archived', status: 400 };

  const activeEng = await prisma.engagement.count({
    where: { clientId: client.id, archivedAt: null },
  });
  if (activeEng > 0) {
    return {
      error: `Client has ${activeEng} active engagement(s). Archive those first.`,
      status: 400,
    };
  }

  if (opts.actorRole === 'Manager') {
    const assigned = await prisma.engagement.findFirst({
      where: {
        clientId: client.id,
        OR: [
          { managerId: opts.actorId },
          { members: { some: { userId: opts.actorId, teamRole: 'Manager' } } },
        ],
      },
      select: { id: true },
    });
    if (!assigned) return { error: 'Managers may only archive assigned clients', status: 403 };
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      archivedAt: new Date(),
      archivedById: opts.actorId,
      restoredAt: null,
      restoredById: null,
      isActive: false,
    },
  });
  await writeAuditLog({
    userId: opts.actorId,
    action: 'ARCHIVE',
    entity: 'Client',
    entityId: client.id,
    details: { name: client.name },
    ipAddress: opts.ipAddress,
  });
  return { ok: true };
}

export async function restoreClient(opts: {
  clientId: string;
  firmId: string;
  actorId: string;
  actorRole: string;
  ipAddress?: string | null;
}): Promise<{ ok: true } | { error: string; status: number }> {
  if (!canArchiveRecords(opts.actorRole)) {
    return { error: 'Not allowed to restore clients', status: 403 };
  }
  const client = await prisma.client.findFirst({
    where: { id: opts.clientId, firmId: opts.firmId },
  });
  if (!client) return { error: 'Client not found', status: 404 };
  if (!client.archivedAt) return { error: 'Not archived', status: 400 };

  if (opts.actorRole === 'Manager' && client.archivedById !== opts.actorId) {
    return { error: 'Managers may only restore clients they archived', status: 403 };
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      archivedAt: null,
      archivedById: null,
      restoredAt: new Date(),
      restoredById: opts.actorId,
      isActive: true,
      status: client.status === 'Inactive' ? 'Active' : client.status,
    },
  });
  await writeAuditLog({
    userId: opts.actorId,
    action: 'RESTORE',
    entity: 'Client',
    entityId: client.id,
    details: { name: client.name },
    ipAddress: opts.ipAddress,
  });
  return { ok: true };
}
