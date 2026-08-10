import type { Server, Socket } from 'socket.io';
import prisma from './prisma.js';
import logger from './logger.js';
import { clientCanAccessRoom } from './chatAccess.js';
import type { AuthRequest } from '../middleware/auth.js';

type SocketUser = NonNullable<AuthRequest['user']>;

let ioRef: Server | null = null;

const typingByRoom = new Map<string, Map<string, { userId: string; name: string; expires: number }>>();

const TYPING_TTL_MS = 4000;

export const CHAT_REACTIONS = ['thumbsup', 'check', 'question'] as const;
export type ChatReactionEmoji = (typeof CHAT_REACTIONS)[number];

export function setChatIo(io: Server) {
  ioRef = io;
}

export function emitChatRoom(roomId: string, event: string, payload: unknown) {
  ioRef?.to(`chat:${roomId}`).emit(event, payload);
}

export function emitChatUser(userId: string, event: string, payload: unknown) {
  ioRef?.to(`user:${userId}`).emit(event, payload);
}

export function broadcastRoomsUpdated(userIds: string[]) {
  for (const uid of userIds) {
    emitChatUser(uid, 'chat-rooms-updated', { at: Date.now() });
  }
}

function pruneTyping(roomId: string) {
  const map = typingByRoom.get(roomId);
  if (!map) return;
  const now = Date.now();
  for (const [k, v] of map) {
    if (v.expires < now) map.delete(k);
  }
  if (map.size === 0) typingByRoom.delete(roomId);
}

export function getTypingInRoom(roomId: string, excludeUserId?: string) {
  pruneTyping(roomId);
  const map = typingByRoom.get(roomId);
  if (!map) return [];
  return [...map.values()]
    .filter((t) => t.userId !== excludeUserId)
    .map((t) => ({ userId: t.userId, name: t.name }));
}

function setTyping(roomId: string, userId: string, name: string, active: boolean) {
  if (!active) {
    typingByRoom.get(roomId)?.delete(userId);
    pruneTyping(roomId);
    return;
  }
  let map = typingByRoom.get(roomId);
  if (!map) {
    map = new Map();
    typingByRoom.set(roomId, map);
  }
  map.set(userId, { userId, name, expires: Date.now() + TYPING_TTL_MS });
}

async function verifyChatMember(
  userId: string,
  role: string,
  roomId: string
): Promise<boolean> {
  const p = await prisma.chatParticipant.findUnique({
    where: { roomId_userId: { roomId, userId } },
    include: { room: { select: { engagementId: true, type: true } } },
  });
  if (!p) return false;

  if (role !== 'Client') return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firmId: true },
  });
  return clientCanAccessRoom(userId, user?.email ?? '', user?.firmId ?? null, p.room);
}

export function registerChatSockets(io: Server) {
  setChatIo(io);

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as SocketUser;
    if (!user?.id) return;

    socket.join(`user:${user.id}`);

    socket.on('join-chat-room', async ({ roomId }, ack) => {
      if (!roomId || !(await verifyChatMember(user.id, user.role, roomId))) {
        ack?.({ ok: false, error: 'Access denied' });
        return;
      }
      socket.join(`chat:${roomId}`);
      ack?.({ ok: true, typing: getTypingInRoom(roomId, user.id) });
    });

    socket.on('leave-chat-room', ({ roomId }) => {
      if (roomId) {
        socket.leave(`chat:${roomId}`);
        setTyping(roomId, user.id, '', false);
        emitChatRoom(roomId, 'chat-typing', { roomId, typing: getTypingInRoom(roomId) });
      }
    });

    socket.on('chat-typing', async ({ roomId, active, displayName }) => {
      if (!roomId || !(await verifyChatMember(user.id, user.role, roomId))) return;
      const u = user as SocketUser & { firstName?: string; lastName?: string; email?: string };
      const name =
        displayName ||
        [u.firstName, u.lastName].filter(Boolean).join(' ') ||
        u.email ||
        'Someone';
      setTyping(roomId, user.id, name, !!active);
      emitChatRoom(roomId, 'chat-typing', { roomId, typing: getTypingInRoom(roomId) });
    });

    socket.on('disconnect', () => {
      for (const [roomId, map] of typingByRoom) {
        if (map.delete(user.id)) {
          emitChatRoom(roomId, 'chat-typing', { roomId, typing: getTypingInRoom(roomId) });
        }
      }
    });
  });
}

type MentionParticipant = {
  userId: string;
  user: { id: string; firstName: string; lastName: string; role?: string };
};

/** Resolve @Manager, @Client, or @First Last / @First mentions to user IDs in the room. */
export function resolveMentionedUserIds(
  content: string,
  participants: MentionParticipant[],
  senderId: string
): string[] {
  const ids = new Set<string>();
  const re = /@(Manager|Client|Partner|Admin|Staff|Intern|[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const token = m[1];
    const roleMatch = ['Manager', 'Client', 'Partner', 'Admin', 'Staff', 'Intern'].find(
      (r) => r.toLowerCase() === token.toLowerCase()
    );
    if (roleMatch) {
      for (const p of participants) {
        const role = p.user.role || '';
        if (role.toLowerCase() === roleMatch.toLowerCase() && p.userId !== senderId) {
          ids.add(p.userId);
        }
      }
      continue;
    }
    const lower = token.toLowerCase();
    for (const p of participants) {
      const full = `${p.user.firstName} ${p.user.lastName}`.trim().toLowerCase();
      const first = p.user.firstName.toLowerCase();
      if (
        (full === lower || first === lower || full.startsWith(lower)) &&
        p.userId !== senderId
      ) {
        ids.add(p.userId);
      }
    }
  }
  return [...ids];
}

export async function notifyMentions(params: {
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  messageId: string;
  participants: MentionParticipant[];
  isClient: boolean;
}) {
  const mentioned = resolveMentionedUserIds(
    params.content,
    params.participants,
    params.senderId
  );
  if (mentioned.length === 0) return;

  const link = params.isClient ? '/client/messages' : '/messages';
  const preview = params.content.slice(0, 120);

  await prisma.notification.createMany({
    data: mentioned.map((userId) => ({
      userId,
      title: `${params.senderName} mentioned you`,
      message: preview,
      type: 'info',
      link: `${link}?room=${params.roomId}`,
    })),
    skipDuplicates: true,
  });

  for (const userId of mentioned) {
    emitChatUser(userId, 'chat-mention', {
      roomId: params.roomId,
      messageId: params.messageId,
      from: params.senderName,
    });
  }
}

export async function touchLastSeen(userId: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { presenceUpdatedAt: new Date() },
    });
  } catch (err) {
    logger.warn('touchLastSeen failed', { error: (err as Error).message });
  }
}
