import prisma from './prisma.js';

/** Ensure an engagement-linked group chat exists; returns room id or null. */
export async function ensureEngagementChatRoom(engagementId: string): Promise<string | null> {
  const existing = await prisma.chatRoom.findFirst({
    where: { engagementId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      title: true,
      clientId: true,
      partnerInChargeId: true,
      managerId: true,
      articleAssistantId: true,
    },
  });
  if (!engagement) return null;

  const participantIds = new Set<string>();
  if (engagement.partnerInChargeId) participantIds.add(engagement.partnerInChargeId);
  if (engagement.managerId) participantIds.add(engagement.managerId);
  if (engagement.articleAssistantId) participantIds.add(engagement.articleAssistantId);

  const portalUsers = await prisma.clientPortalUser.findMany({
    where: { clientId: engagement.clientId, isActive: true },
    select: { userId: true },
  });
  for (const pu of portalUsers) {
    if (pu.userId) participantIds.add(pu.userId);
  }

  const fallbackSender =
    engagement.partnerInChargeId || engagement.managerId || engagement.articleAssistantId;
  if (!fallbackSender && participantIds.size === 0) return null;
  if (fallbackSender) participantIds.add(fallbackSender);

  const room = await prisma.chatRoom.create({
    data: {
      name: engagement.title,
      type: 'group',
      engagementId: engagement.id,
      participants: {
        create: Array.from(participantIds).map((userId) => ({ userId })),
      },
    },
    select: { id: true },
  });
  return room.id;
}

/**
 * Reconcile an engagement chat room's participants with the current team.
 * ensureEngagementChatRoom only sets participants on first creation, so when
 * the team is reassigned the room's member list goes stale — newly assigned
 * staff can't see the chat and removed staff linger. This adds the current
 * team + active client portal users and removes firm users no longer on the
 * team (client portal users are always kept).
 */
export async function syncEngagementChatParticipants(engagementId: string): Promise<void> {
  const room = await prisma.chatRoom.findFirst({
    where: { engagementId },
    select: { id: true },
  });
  // No room yet — it will be created with the correct team on first message.
  if (!room) return;

  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: {
      clientId: true,
      partnerInChargeId: true,
      managerId: true,
      articleAssistantId: true,
      members: {
        where: { teamRole: { not: null } },
        select: { userId: true },
      },
    },
  });
  if (!engagement) return;

  const firmDesired = new Set<string>();
  if (engagement.partnerInChargeId) firmDesired.add(engagement.partnerInChargeId);
  if (engagement.managerId) firmDesired.add(engagement.managerId);
  if (engagement.articleAssistantId) firmDesired.add(engagement.articleAssistantId);
  for (const m of engagement.members) firmDesired.add(m.userId);

  const portalUsers = await prisma.clientPortalUser.findMany({
    where: { clientId: engagement.clientId, isActive: true },
    select: { userId: true },
  });
  const clientUserIds = new Set(
    portalUsers.map((p) => p.userId).filter((id): id is string => Boolean(id))
  );

  const existing = await prisma.chatParticipant.findMany({
    where: { roomId: room.id },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((p) => p.userId));

  const desired = new Set<string>([...firmDesired, ...clientUserIds]);

  const toAdd = [...desired].filter((id) => !existingIds.has(id));
  // Only remove firm users who left the team — never auto-remove client users.
  const toRemove = [...existingIds].filter(
    (id) => !desired.has(id) && !clientUserIds.has(id)
  );

  if (toAdd.length > 0) {
    await prisma.chatParticipant.createMany({
      data: toAdd.map((userId) => ({ roomId: room.id, userId })),
      skipDuplicates: true,
    });
  }
  if (toRemove.length > 0) {
    await prisma.chatParticipant.deleteMany({
      where: { roomId: room.id, userId: { in: toRemove } },
    });
  }
}

export async function postEngagementChatMessage(
  engagementId: string,
  senderId: string,
  content: string,
  messageType: 'text' | 'system' = 'text'
): Promise<void> {
  const roomId = await ensureEngagementChatRoom(engagementId);
  if (!roomId) return;
  await prisma.chatMessage.create({
    data: { roomId, senderId, content, messageType },
  });
}
