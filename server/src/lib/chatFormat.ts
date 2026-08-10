import prisma from './prisma.js';

/** Strip decorative emoji prefixes from legacy room titles (e.g. folder icon + engagement name). */
export function sanitizeChatRoomName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const cleaned = name
    .replace(/^[\s\u{1F4C1}\u{1F4C2}\u{1F4CE}\u{1F5C2}\u{1F4C4}]+/u, '')
    .replace(/^\p{Extended_Pictographic}+\s*/u, '')
    .trim();
  return cleaned || name.trim();
}

export type RoomWithParticipants = {
  id: string;
  name: string | null;
  type: string;
  engagementId: string | null;
  updatedAt: Date;
  participants: {
    userId: string;
    role: string;
    lastReadAt: Date;
    isMuted?: boolean;
    isPinned?: boolean;
    isArchived?: boolean;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      initials: string;
      presenceStatus?: string | null;
      presenceUpdatedAt?: Date | null;
      role?: string;
    };
  }[];
  messages?: {
    id: string;
    content: string;
    createdAt: Date;
    messageType: string;
    senderId: string;
    sender: { firstName: string; lastName: string };
  }[];
};

export const roomInclude = {
  participants: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          initials: true,
          presenceStatus: true,
          role: true,
        },
      },
    },
  },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      content: true,
      createdAt: true,
      messageType: true,
      senderId: true,
      sender: { select: { firstName: true, lastName: true } },
    },
  },
};

function mapMessageType(t: string): 'TEXT' | 'FILE' | 'SYSTEM' | 'VOICE' {
  const u = t.toLowerCase();
  if (u === 'file') return 'FILE';
  if (u === 'system') return 'SYSTEM';
  if (u === 'voice') return 'VOICE';
  return 'TEXT';
}

export async function formatChatRoom(room: RoomWithParticipants, userId: string) {
  const participant = room.participants.find((p) => p.userId === userId);
  const lastRead = participant?.lastReadAt || new Date(0);
  const unreadCount = await prisma.chatMessage.count({
    where: {
      roomId: room.id,
      createdAt: { gt: lastRead },
      senderId: { not: userId },
      isDeleted: false,
    },
  });
  const last = room.messages?.[0];
  return {
    id: room.id,
    name: sanitizeChatRoomName(room.name),
    type:
      room.type === 'group' && room.engagementId
        ? 'CHANNEL'
        : room.type === 'direct'
          ? 'DM'
          : 'GROUP',
    engagementId: room.engagementId,
    isMuted: participant?.isMuted ?? false,
    isPinned: participant?.isPinned ?? false,
    isArchived: participant?.isArchived ?? false,
    participants: room.participants.map((p) => ({
      userId: p.user.id,
      user: {
        id: p.user.id,
        name: `${p.user.firstName} ${p.user.lastName}`.trim(),
        email: '',
        initials: p.user.initials,
        presenceStatus: p.user.presenceStatus || 'online',
        lastSeenAt: p.user.presenceUpdatedAt?.toISOString() ?? null,
        role: p.user.role,
      },
      role: p.role,
    })),
    lastMessage: last
      ? {
          id: last.id,
          content: last.content,
          createdAt: last.createdAt.toISOString(),
          type: mapMessageType(last.messageType),
          sender: {
            id: '',
            name: `${last.sender.firstName} ${last.sender.lastName}`.trim(),
            email: '',
            initials: '',
          },
          senderId: last.senderId,
        }
      : null,
    unreadCount,
    updatedAt: room.updatedAt.toISOString(),
  };
}

export function formatMessagePayload(
  m: {
    id: string;
    roomId: string;
    senderId: string;
    content: string;
    messageType: string;
    fileName?: string | null;
    fileOriginalName?: string | null;
    fileMimeType?: string | null;
    fileSize?: number | null;
    parentId?: string | null;
    forwardedFromMessageId?: string | null;
    forwardedFromSenderName?: string | null;
    isDeleted: boolean;
    createdAt: Date;
    sender: { id: string; firstName: string; lastName: string; initials: string };
    parent?: {
      id: string;
      content: string;
      messageType: string;
      isDeleted: boolean;
      sender: { firstName: string; lastName: string };
    } | null;
    reactions?: { emoji: string; userId: string; user: { firstName: string; lastName: string } }[];
    starredByMe?: boolean;
  },
  opts?: { isPinned?: boolean; starredByMe?: boolean }
) {
  return {
    id: m.id,
    roomId: m.roomId,
    senderId: m.senderId,
    content: m.isDeleted ? '' : m.content,
    messageType: m.messageType,
    fileName: m.isDeleted ? null : m.fileName,
    fileOriginalName: m.isDeleted ? null : m.fileOriginalName,
    fileMimeType: m.isDeleted ? null : m.fileMimeType,
    fileSize: m.isDeleted ? null : m.fileSize,
    parentId: m.parentId,
    parent: m.parent
      ? {
          id: m.parent.id,
          content: m.parent.isDeleted ? '' : m.parent.content,
          messageType: m.parent.messageType,
          senderName: `${m.parent.sender.firstName} ${m.parent.sender.lastName}`.trim(),
        }
      : null,
    forwardedFromMessageId: m.forwardedFromMessageId,
    forwardedFromSenderName: m.forwardedFromSenderName,
    isDeleted: m.isDeleted,
    createdAt: m.createdAt.toISOString(),
    sender: m.sender,
    isPinned: opts?.isPinned ?? false,
    isStarred: opts?.starredByMe ?? false,
    reactions: (m.reactions || []).map((r) => ({
      emoji: r.emoji,
      userId: r.userId,
      userName: `${r.user.firstName} ${r.user.lastName}`.trim(),
    })),
  };
}

export const messageInclude = {
  sender: { select: { id: true, firstName: true, lastName: true, initials: true } },
  parent: {
    select: {
      id: true,
      content: true,
      messageType: true,
      isDeleted: true,
      sender: { select: { firstName: true, lastName: true } },
    },
  },
  reactions: {
    include: {
      user: { select: { firstName: true, lastName: true } },
    },
  },
} as const;
