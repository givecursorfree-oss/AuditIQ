import { Response } from 'express';
import prisma from './prisma.js';
import { resolveClientIdForPortalUser } from './clientScope.js';
import { isPrivilegedRole } from './permissions.js';
import { listAccessibleEngagementIds } from './engagementAccess.js';
import type { AuthRequest } from '../middleware/auth.js';

/** Engagement IDs for a client portal user (their organization's engagements). */
export async function getClientEngagementIds(
  userId: string,
  email: string,
  firmId: string | null
): Promise<string[]> {
  const scope = await resolveClientIdForPortalUser(userId, email, firmId);
  if (!scope.clientId) return [];

  const engagements = await prisma.engagement.findMany({
    where: { clientId: scope.clientId },
    select: { id: true },
  });
  return engagements.map((e) => e.id);
}

/** All firm users assigned to an engagement (team + client portal users for that client). */
export async function collectEngagementTeamUserIds(engagementId: string): Promise<string[]> {
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: {
      clientId: true,
      partnerInChargeId: true,
      managerId: true,
      articleAssistantId: true,
      members: { select: { userId: true } },
    },
  });
  if (!engagement) return [];

  const ids = new Set<string>();
  if (engagement.partnerInChargeId) ids.add(engagement.partnerInChargeId);
  if (engagement.managerId) ids.add(engagement.managerId);
  if (engagement.articleAssistantId) ids.add(engagement.articleAssistantId);
  for (const m of engagement.members) ids.add(m.userId);

  const portalUsers = await prisma.clientPortalUser.findMany({
    where: { clientId: engagement.clientId, isActive: true },
    select: { userId: true },
  });
  for (const pu of portalUsers) {
    if (pu.userId) ids.add(pu.userId);
  }

  return [...ids];
}

/** Clients may only use engagement channel rooms for their client's engagements. */
export async function clientCanAccessRoom(
  userId: string,
  email: string,
  firmId: string | null,
  room: { engagementId: string | null; type: string }
): Promise<boolean> {
  if (!room.engagementId) return false;
  if (room.type === 'direct') return false;

  const allowed = await getClientEngagementIds(userId, email, firmId);
  return allowed.includes(room.engagementId);
}

/** Staff (non-client) may start a DM / include a user in a new chat. Admin/Partner: anyone in firm. Others: staff freely; clients only if on a shared engagement. */
export async function canStaffChatWithUser(
  actorId: string,
  actorRole: string,
  firmId: string | null,
  targetUserId: string
): Promise<boolean> {
  if (actorId === targetUserId) return true;
  if (!firmId) return false;

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, firmId, isActive: true },
    select: { id: true, role: true },
  });
  if (!target) return false;

  if (target.role !== 'Client') return true;
  if (isPrivilegedRole(actorRole)) return true;

  const actorEngagements = await listAccessibleEngagementIds(actorId, actorRole, firmId);
  if (actorEngagements.length === 0) return false;

  const portal = await prisma.clientPortalUser.findFirst({
    where: {
      userId: targetUserId,
      isActive: true,
      client: { engagements: { some: { id: { in: actorEngagements } } } },
    },
    select: { id: true },
  });
  return !!portal;
}

type RoomAccessRow = {
  id: string;
  engagementId: string | null;
  type: string;
};

/**
 * Verify membership and client engagement scope. Returns participant row or sends 403/404.
 */
export async function requireChatRoomAccess(
  req: AuthRequest,
  res: Response,
  roomId: string
): Promise<{ id: string; roomId: string; userId: string } | null> {
  const user = req.user!;
  const participant = await prisma.chatParticipant.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } },
    include: {
      room: { select: { id: true, engagementId: true, type: true } },
    },
  });

  if (!participant) {
    res.status(403).json({ error: 'Not a member of this room' });
    return null;
  }

  if (user.role === 'Client') {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, firmId: true },
    });
    const ok = await clientCanAccessRoom(
      user.id,
      dbUser?.email ?? '',
      dbUser?.firmId ?? user.firmId ?? null,
      participant.room as RoomAccessRow
    );
    if (!ok) {
      res.status(403).json({ error: 'You can only access chats for your assigned engagements' });
      return null;
    }
  }

  return participant;
}
