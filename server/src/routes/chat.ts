import { Router, Response } from 'express';
import { z } from 'zod';
import path from 'path';
import multer from 'multer';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { isIndianBusinessHours, AFTER_HOURS_AUTO_REPLY } from '../lib/businessHours.js';
import {
  broadcastRoomsUpdated,
  CHAT_REACTIONS,
  emitChatRoom,
  notifyMentions,
  touchLastSeen,
} from '../lib/chatRealtime.js';
import {
  formatChatRoom,
  formatMessagePayload,
  messageInclude,
  roomInclude,
  type RoomWithParticipants,
} from '../lib/chatFormat.js';
import {
  canStaffChatWithUser,
  collectEngagementTeamUserIds,
  getClientEngagementIds,
  requireChatRoomAccess,
} from '../lib/chatAccess.js';
import { listAccessibleEngagementIds, requireEngagementAccess } from '../lib/engagementAccess.js';
import { isPrivilegedRole } from '../lib/permissions.js';
import { validateBufferSignature } from '../lib/fileSignature.js';

const router = Router();
// 25MB cap — attachments buffer in memory before DB write; unbounded uploads
// would allow trivial memory-exhaustion DoS.
const CHAT_MAX_FILE_BYTES = 25 * 1024 * 1024;
const CHAT_BLOCKED_EXTS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.com', '.msi', '.scr', '.js', '.html', '.htm',
  '.svg', '.xml', '.xhtml', '.ps1', '.vbs', '.sh',
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (CHAT_BLOCKED_EXTS.has(ext)) {
      cb(new Error('This file type is not allowed in chat'));
      return;
    }
    cb(null, true);
  },
});

router.use(authenticate);

// ─── Chat Rooms ───

const roomTypeSchema = z
  .enum(['direct', 'group', 'channel', 'DM'])
  .transform((t) => (t === 'DM' ? 'direct' : t));

const roomSchema = z.object({
  name: z.string().optional(),
  type: roomTypeSchema.default('direct'),
  participantIds: z.array(z.string().uuid()).min(1),
});

async function emitRoomRefresh(roomId: string) {
  const parts = await prisma.chatParticipant.findMany({
    where: { roomId },
    select: { userId: true },
  });
  broadcastRoomsUpdated(parts.map((p) => p.userId));
}

// GET /api/chat/rooms — list rooms the user is in
router.get('/rooms', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const isClient = req.user!.role === 'Client';

    let clientEngagementIds: string[] | null = null;
    if (isClient) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firmId: true },
      });
      clientEngagementIds = await getClientEngagementIds(
        userId,
        user?.email ?? '',
        user?.firmId ?? null
      );
      if (clientEngagementIds.length === 0) {
        res.json([]);
        return;
      }
    }

    const includeArchived = req.query.includeArchived === '1';

    const rooms = await prisma.chatRoom.findMany({
      where: {
        participants: {
          some: { userId },
        },
        ...(isClient
          ? {
              engagementId: { in: clientEngagementIds ?? [] },
              type: { not: 'direct' },
            }
          : {}),
      },
      include: roomInclude,
      orderBy: { updatedAt: 'desc' },
    });

    const formatted = await Promise.all(
      rooms.map((room) => formatChatRoom(room as RoomWithParticipants, userId))
    );

    const list = formatted
      .filter((r) => includeArchived || !r.isArchived)
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

    res.json(list);
  } catch (err) {
    logger.error('Failed to list chat rooms', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list rooms' });
  }
});

// POST /api/chat/rooms — create a new room
router.post('/rooms', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role === 'Client') {
      res.status(403).json({ error: 'Clients cannot create direct messages. Use your engagement thread.' });
      return;
    }
    const data = roomSchema.parse(req.body);
    const userId = req.user!.id;
    const role = req.user!.role;
    const firmId = req.user!.firmId ?? null;

    for (const otherId of data.participantIds) {
      const allowed = await canStaffChatWithUser(userId, role, firmId, otherId);
      if (!allowed) {
        res.status(403).json({
          error: 'You can only start chats with firm members, or clients on your assigned engagements',
        });
        return;
      }
    }

    // For direct messages, check if a DM room already exists
    if (data.type === 'direct' && data.participantIds.length === 1) {
      const otherId = data.participantIds[0];
      const existing = await prisma.chatRoom.findFirst({
        where: {
          type: 'direct',
          AND: [
            { participants: { some: { userId } } },
            { participants: { some: { userId: otherId } } },
          ],
        },
        include: roomInclude,
      });

      if (existing) {
        res.json(await formatChatRoom(existing as RoomWithParticipants, userId));
        return;
      }
    }

    const allIds = [...new Set([userId, ...data.participantIds])];

    const room = await prisma.chatRoom.create({
      data: {
        name: data.name,
        type: data.type,
        participants: {
          create: allIds.map((id) => ({
            userId: id,
            role: id === userId ? 'admin' : 'member',
          })),
        },
      },
      include: roomInclude,
    });

    res.status(201).json(await formatChatRoom(room as RoomWithParticipants, userId));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to create chat room', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// ─── Messages ───

// GET /api/chat/rooms/:roomId/messages — paginated message history
router.get('/rooms/:roomId/messages', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const participant = await requireChatRoomAccess(req, res, roomId);
    if (!participant) return;

    const q = (req.query.q as string | undefined)?.trim();

    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
        ...(q
          ? {
              OR: [
                { content: { contains: q } },
                { fileName: { contains: q } },
                { fileOriginalName: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      omit: { fileData: true },
      include: messageInclude,
    });

    const [pins, stars] = await Promise.all([
      prisma.chatPinnedMessage.findMany({
        where: { roomId },
        select: { messageId: true },
      }),
      prisma.chatMessageStar.findMany({
        where: { roomId, userId: req.user!.id },
        select: { messageId: true },
      }),
    ]);
    const pinnedIds = new Set(pins.map((p) => p.messageId));
    const starredIds = new Set(stars.map((s) => s.messageId));

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    await prisma.chatParticipant.update({
      where: { roomId_userId: { roomId, userId: req.user!.id } },
      data: { lastReadAt: new Date() },
    });
    await touchLastSeen(req.user!.id);

    res.json({
      messages: messages.reverse().map((m) =>
        formatMessagePayload(m, {
          isPinned: pinnedIds.has(m.id),
          starredByMe: starredIds.has(m.id),
        })
      ),
      hasMore,
      nextCursor: hasMore ? messages[0]?.id : null,
    });
  } catch (err) {
    logger.error('Failed to get messages', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// POST /api/chat/rooms/:roomId/messages — send a message
router.post('/rooms/:roomId/messages', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const userId = req.user!.id;

    const msgSchema = z.object({
      content: z.string().min(1).max(5000),
      messageType: z.enum(['text', 'file', 'system', 'voice']).default('text'),
      parentId: z.string().uuid().optional(),
    });

    const data = msgSchema.parse(req.body);

    const participant = await requireChatRoomAccess(req, res, roomId);
    if (!participant) return;

    const roomWithParticipants = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        },
      },
    });
    if (!roomWithParticipants) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (data.parentId) {
      const parent = await prisma.chatMessage.findFirst({
        where: { id: data.parentId, roomId },
      });
      if (!parent) {
        res.status(400).json({ error: 'Reply target not found in this room' });
        return;
      }
    }

    const message = await prisma.chatMessage.create({
      data: {
        roomId,
        senderId: userId,
        content: data.content,
        messageType: data.messageType,
        parentId: data.parentId,
      },
      include: messageInclude,
    });

    await prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    await prisma.chatParticipant.update({
      where: { roomId_userId: { roomId, userId } },
      data: { lastReadAt: new Date() },
    });

    await touchLastSeen(userId);

    const senderName = `${message.sender.firstName} ${message.sender.lastName}`.trim();
    const payload = formatMessagePayload(message);
    emitChatRoom(roomId, 'chat-message', payload);
    await emitRoomRefresh(roomId);

    await notifyMentions({
      roomId,
      senderId: userId,
      senderName,
      content: data.content,
      messageId: message.id,
      participants: roomWithParticipants.participants.map((p) => ({
        userId: p.userId,
        user: p.user,
      })),
      isClient: req.user!.role === 'Client',
    });

    // After-hours auto-reply for client messages
    if (req.user!.role === 'Client' && data.messageType === 'text' && !isIndianBusinessHours()) {
      const room = await prisma.chatRoom.findUnique({
        where: { id: roomId },
        select: { engagementId: true },
      });
      let systemSenderId = req.user!.id;
      if (room?.engagementId) {
        const eng = await prisma.engagement.findUnique({
          where: { id: room.engagementId },
          select: { partnerInChargeId: true, managerId: true },
        });
        systemSenderId = eng?.partnerInChargeId || eng?.managerId || systemSenderId;
      }
      await prisma.chatMessage.create({
        data: {
          roomId,
          senderId: systemSenderId,
          content: AFTER_HOURS_AUTO_REPLY,
          messageType: 'system',
        },
      });
    }

    res.status(201).json(payload);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to send message', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/chat/rooms/:roomId/messages/file — send a file message
router.post('/rooms/:roomId/messages/file', upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const userId = req.user!.id;
    const file = req.file;

    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const signatureError = validateBufferSignature(file.buffer, file.originalname);
    if (signatureError) { res.status(400).json({ error: signatureError }); return; }

    const participant = await requireChatRoomAccess(req, res, roomId);
    if (!participant) return;

    const isVoice = file.mimetype.startsWith('audio/');
    const message = await prisma.chatMessage.create({
      data: {
        roomId,
        senderId: userId,
        content: isVoice ? 'Voice message' : file.originalname,
        messageType: isVoice ? 'voice' : 'file',
        fileName: file.originalname,
        fileOriginalName: file.originalname,
        fileMimeType: file.mimetype,
        fileSize: file.size,
        fileData: file.buffer as unknown as Uint8Array<ArrayBuffer>,
      },
      include: messageInclude,
    });

    await prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    await touchLastSeen(userId);
    const payload = formatMessagePayload(message);
    emitChatRoom(roomId, 'chat-message', payload);
    await emitRoomRefresh(roomId);

    res.status(201).json(payload);
  } catch (err) {
    logger.error('Failed to send file message', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to send file' });
  }
});

// GET /api/chat/rooms/:roomId/messages/:msgId/file — preview (inline) or download (attachment)
router.get('/rooms/:roomId/messages/:msgId/file', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId, msgId } = req.params;
    const userId = req.user!.id;
    const disposition =
      req.query.disposition === 'inline' ? 'inline' : 'attachment';

    const participant = await requireChatRoomAccess(req, res, roomId);
    if (!participant) return;

    const message = await prisma.chatMessage.findFirst({
      where: { id: msgId, roomId, messageType: 'file', isDeleted: false },
      select: {
        fileName: true,
        fileOriginalName: true,
        fileMimeType: true,
        fileData: true,
      },
    });

    if (!message?.fileData) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const filename = message.fileOriginalName || message.fileName || 'attachment';
    const safeName = filename.replace(/[^\w.\-() ]/g, '_');
    const mime = message.fileMimeType || 'application/octet-stream';
    const safeInline = /^(image\/(png|jpeg|jpg|gif|webp)|application\/pdf|audio\/)/i.test(mime);
    const useInline = disposition === 'inline' && safeInline;
    res.setHeader('Content-Type', useInline ? mime : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${useInline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(safeName)}"`
    );
    res.send(Buffer.from(message.fileData));
  } catch (err) {
    logger.error('Failed to download chat file', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// DELETE /api/chat/rooms/:roomId/messages/:msgId — soft-delete (sender or Partner/Admin)
router.delete('/rooms/:roomId/messages/:msgId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId, msgId } = req.params;
    const userId = req.user!.id;
    const role = req.user!.role;

    const participant = await requireChatRoomAccess(req, res, roomId);
    if (!participant) return;

    const message = await prisma.chatMessage.findFirst({
      where: { id: msgId, roomId },
    });
    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (message.isDeleted) {
      res.json({ success: true });
      return;
    }

    const canDelete =
      message.senderId === userId || role === 'Partner' || role === 'Admin';
    if (!canDelete) {
      res.status(403).json({ error: 'You can only delete your own messages' });
      return;
    }

    await prisma.chatMessage.update({
      where: { id: msgId },
      data: { isDeleted: true, content: '' },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete message', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// POST /api/chat/rooms/:roomId/messages/:msgId/forward — forward to another room
router.post('/rooms/:roomId/messages/:msgId/forward', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId, msgId } = req.params;
    const userId = req.user!.id;

    const bodySchema = z.object({ targetRoomId: z.string().uuid() });
    const { targetRoomId } = bodySchema.parse(req.body);

    if (targetRoomId === roomId) {
      res.status(400).json({ error: 'Cannot forward to the same conversation' });
      return;
    }

    const sourceParticipant = await requireChatRoomAccess(req, res, roomId);
    if (!sourceParticipant) return;
    const targetParticipant = await requireChatRoomAccess(req, res, targetRoomId);
    if (!targetParticipant) return;

    const source = await prisma.chatMessage.findFirst({
      where: { id: msgId, roomId, isDeleted: false },
      include: {
        sender: { select: { firstName: true, lastName: true } },
      },
    });
    if (!source) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const forwardedFromSenderName = `${source.sender.firstName} ${source.sender.lastName}`.trim();

    let forwarded;
    if (source.messageType === 'file' && source.fileData) {
      forwarded = await prisma.chatMessage.create({
        data: {
          roomId: targetRoomId,
          senderId: userId,
          content: source.fileOriginalName || source.fileName || 'Attachment',
          messageType: 'file',
          fileName: source.fileName,
          fileOriginalName: source.fileOriginalName,
          fileMimeType: source.fileMimeType,
          fileSize: source.fileSize,
          fileData: source.fileData,
          forwardedFromMessageId: source.id,
          forwardedFromSenderName,
        },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, initials: true } },
        },
      });
    } else {
      forwarded = await prisma.chatMessage.create({
        data: {
          roomId: targetRoomId,
          senderId: userId,
          content: source.content,
          messageType: 'text',
          forwardedFromMessageId: source.id,
          forwardedFromSenderName,
        },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, initials: true } },
        },
      });
    }

    await prisma.chatRoom.update({
      where: { id: targetRoomId },
      data: { updatedAt: new Date() },
    });

    await prisma.chatParticipant.update({
      where: { roomId_userId: { roomId: targetRoomId, userId } },
      data: { lastReadAt: new Date() },
    });

    res.status(201).json({ ...forwarded, fileData: undefined });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to forward message', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to forward message' });
  }
});

// ─── Pin / Unpin Messages ───

// POST /api/chat/rooms/:roomId/messages/:msgId/pin
router.post('/rooms/:roomId/messages/:msgId/pin', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId, msgId } = req.params;

    await prisma.chatPinnedMessage.create({
      data: {
        roomId,
        messageId: msgId,
      },
    });

    res.status(201).json({ success: true });
  } catch (err) {
    logger.error('Failed to pin message', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// DELETE /api/chat/rooms/:roomId/messages/:msgId/pin
router.delete('/rooms/:roomId/messages/:msgId/pin', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId, msgId } = req.params;

    await prisma.chatPinnedMessage.deleteMany({
      where: { roomId, messageId: msgId },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to unpin message', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to unpin message' });
  }
});

// GET /api/chat/rooms/:roomId/pinned
router.get('/rooms/:roomId/pinned', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pins = await prisma.chatPinnedMessage.findMany({
      where: { roomId: req.params.roomId },
      include: {
        message: {
          include: { sender: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { pinnedAt: 'desc' },
    });
    res.json(pins);
  } catch (err) {
    logger.error('Failed to get pinned messages', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get pinned messages' });
  }
});

// ─── Mark as read ───
router.post('/rooms/:roomId/read', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const participant = await requireChatRoomAccess(req, res, req.params.roomId);
    if (!participant) return;

    await prisma.chatParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to mark as read', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// GET /api/chat/users — staff: firm members (+ clients on shared engagements). Admin/Partner: everyone in firm.
router.get('/users', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role === 'Client') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const firmId = req.user!.firmId;
    if (!firmId) {
      res.json([]);
      return;
    }

    const userId = req.user!.id;
    const role = req.user!.role;

    let where = {
      firmId,
      isActive: true,
    } as { firmId: string; isActive: boolean; OR?: object[] };

    if (!isPrivilegedRole(role)) {
      const engIds = await listAccessibleEngagementIds(userId, role, firmId);
      const portalRows = await prisma.clientPortalUser.findMany({
        where: {
          isActive: true,
          userId: { not: null },
          client: { engagements: { some: { id: { in: engIds } } } },
        },
        select: { userId: true },
      });
      const clientUserIds = portalRows.map((r) => r.userId!).filter(Boolean);

      where = {
        firmId,
        isActive: true,
        OR: [
          { role: { not: 'Client' } },
          ...(clientUserIds.length > 0 ? [{ id: { in: clientUserIds } }] : []),
        ],
      };
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        initials: true,
        email: true,
        role: true,
        designation: true,
        presenceStatus: true,
      },
      orderBy: { firstName: 'asc' },
    });
    res.json(
      users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        initials: u.initials,
        role: u.role,
        designation: u.designation,
        presenceStatus: u.presenceStatus || 'online',
      }))
    );
  } catch (err) {
    logger.error('Failed to list chat users', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// POST /api/chat/engagement-room — auto-create a chat room linked to an engagement
router.post('/engagement-room', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engagementId } = req.body;
    if (!engagementId) {
      res.status(400).json({ error: 'engagementId is required' });
      return;
    }

    if (!(await requireEngagementAccess(req, res, engagementId))) return;

    const engagement = await prisma.engagement.findFirst({
      where: { id: engagementId, firmId: req.user!.firmId! },
      select: { id: true, title: true },
    });
    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    const existing = await prisma.chatRoom.findFirst({
      where: { engagementId },
      include: roomInclude,
    });
    if (existing) {
      res.json(await formatChatRoom(existing as RoomWithParticipants, req.user!.id));
      return;
    }

    const participantIds = new Set(await collectEngagementTeamUserIds(engagementId));
    participantIds.add(req.user!.id);

    const room = await prisma.chatRoom.create({
      data: {
        name: engagement.title,
        type: 'group',
        engagementId,
        participants: {
          create: Array.from(participantIds).map((userId) => ({ userId })),
        },
      },
      include: { participants: { include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } } } },
    });

    res.status(201).json(room);
  } catch (err) {
    logger.error('Engagement room creation error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create engagement room' });
  }
});

// PATCH /api/chat/rooms/:roomId/settings — mute, pin conversation, archive
router.patch('/rooms/:roomId/settings', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const userId = req.user!.id;
    const schema = z.object({
      isMuted: z.boolean().optional(),
      isPinned: z.boolean().optional(),
      isArchived: z.boolean().optional(),
    });
    const data = schema.parse(req.body);

    const participant = await requireChatRoomAccess(req, res, roomId);
    if (!participant) return;

    const updateData: { isMuted?: boolean; isPinned?: boolean; isArchived?: boolean } = {};
    if (data.isMuted !== undefined) updateData.isMuted = data.isMuted;
    if (data.isPinned !== undefined) updateData.isPinned = data.isPinned;
    if (data.isArchived !== undefined) updateData.isArchived = data.isArchived;

    let updated;
    try {
      updated = await prisma.chatParticipant.update({
        where: { id: participant.id },
        data: updateData,
      });
    } catch (updateErr) {
      const msg = (updateErr as Error).message || '';
      if (msg.includes('isPinned') || msg.includes('isArchived')) {
        const fallback: { isMuted?: boolean } = {};
        if (data.isMuted !== undefined) fallback.isMuted = data.isMuted;
        updated = await prisma.chatParticipant.update({
          where: { id: participant.id },
          data: fallback,
        });
      } else {
        throw updateErr;
      }
    }
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to update chat settings', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/chat/search?q= — global search across user's rooms
router.get('/search', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q || q.length < 2) {
      res.json({ rooms: [], messages: [] });
      return;
    }
    const userId = req.user!.id;
    const isClient = req.user!.role === 'Client';

    const myRooms = await prisma.chatParticipant.findMany({
      where: { userId },
      select: { roomId: true, room: { select: { engagementId: true, type: true } } },
    });

    let roomIds = myRooms.map((r) => r.roomId);

    if (isClient) {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firmId: true },
      });
      const allowedEngagements = await getClientEngagementIds(
        userId,
        dbUser?.email ?? '',
        dbUser?.firmId ?? null
      );
      roomIds = myRooms
        .filter(
          (r) =>
            r.room.engagementId &&
            allowedEngagements.includes(r.room.engagementId) &&
            r.room.type !== 'direct'
        )
        .map((r) => r.roomId);
    }
    if (roomIds.length === 0) {
      res.json({ rooms: [], messages: [] });
      return;
    }

    const [roomHits, messageHits] = await Promise.all([
      prisma.chatRoom.findMany({
        where: {
          id: { in: roomIds },
          OR: [{ name: { contains: q } }],
        },
        include: roomInclude,
        take: 10,
      }),
      prisma.chatMessage.findMany({
        where: {
          roomId: { in: roomIds },
          isDeleted: false,
          OR: [
            { content: { contains: q } },
            { fileName: { contains: q } },
            { fileOriginalName: { contains: q } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        omit: { fileData: true },
        include: {
          sender: { select: { firstName: true, lastName: true } },
          room: { select: { id: true, name: true, type: true, engagementId: true } },
        },
      }),
    ]);

    const rooms = await Promise.all(
      roomHits.map((r) => formatChatRoom(r as RoomWithParticipants, userId))
    );

    res.json({
      rooms,
      messages: messageHits.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        roomName: m.room.name,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        senderName: `${m.sender.firstName} ${m.sender.lastName}`.trim(),
      })),
    });
  } catch (err) {
    logger.error('Chat global search failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/chat/starred — user's starred messages (WhatsApp-style)
router.get('/starred', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stars = await prisma.chatMessageStar.findMany({
      where: { userId: req.user!.id },
      orderBy: { starredAt: 'desc' },
      take: 100,
      include: {
        message: {
          omit: { fileData: true },
          include: messageInclude,
        },
      },
    });
    res.json(
      stars.map((s) => ({
        roomId: s.roomId,
        starredAt: s.starredAt.toISOString(),
        message: formatMessagePayload(s.message, { starredByMe: true }),
      }))
    );
  } catch (err) {
    logger.error('Failed to list starred messages', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list starred messages' });
  }
});

// GET /api/chat/rooms/:roomId/media?tab=photos|docs|links
router.get('/rooms/:roomId/media', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const tab = (req.query.tab as string) || 'photos';
    const userId = req.user!.id;

    const participant = await requireChatRoomAccess(req, res, roomId);
    if (!participant) return;

    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
        isDeleted: false,
        messageType: { in: ['file', 'voice'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      omit: { fileData: true },
      include: { sender: { select: { firstName: true, lastName: true } } },
    });

    const urlRe = /https?:\/\/[^\s]+/gi;
    const items: {
      id: string;
      tab: string;
      fileName?: string;
      mimeType?: string;
      createdAt: string;
      senderName: string;
    }[] = [];

    for (const m of messages) {
      const senderName = `${m.sender.firstName} ${m.sender.lastName}`.trim();
      const mime = m.fileMimeType || '';
      if (tab === 'photos' && mime.startsWith('image/')) {
        items.push({
          id: m.id,
          tab,
          fileName: m.fileOriginalName || m.fileName || undefined,
          mimeType: mime,
          createdAt: m.createdAt.toISOString(),
          senderName,
        });
      } else if (
        tab === 'docs' &&
        (mime.startsWith('application/') || mime.includes('pdf') || mime.includes('document'))
      ) {
        items.push({
          id: m.id,
          tab,
          fileName: m.fileOriginalName || m.fileName || undefined,
          mimeType: mime,
          createdAt: m.createdAt.toISOString(),
          senderName,
        });
      }
    }

    if (tab === 'links') {
      const textMsgs = await prisma.chatMessage.findMany({
        where: { roomId, isDeleted: false, messageType: 'text' },
        orderBy: { createdAt: 'desc' },
        take: 300,
        select: { id: true, content: true, createdAt: true, sender: { select: { firstName: true, lastName: true } } },
      });
      for (const m of textMsgs) {
        const links = m.content.match(urlRe);
        if (links) {
          for (const link of links) {
            items.push({
              id: m.id,
              tab: 'links',
              fileName: link,
              createdAt: m.createdAt.toISOString(),
              senderName: `${m.sender.firstName} ${m.sender.lastName}`.trim(),
            });
          }
        }
      }
    }

    res.json({ items });
  } catch (err) {
    logger.error('Failed to get chat media', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get media' });
  }
});

// POST /api/chat/rooms/:roomId/messages/:msgId/reactions
router.post('/rooms/:roomId/messages/:msgId/reactions', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId, msgId } = req.params;
    const userId = req.user!.id;
    const { emoji } = z.object({ emoji: z.enum(CHAT_REACTIONS) }).parse(req.body);

    const participant = await requireChatRoomAccess(req, res, roomId);
    if (!participant) return;

    const reaction = await prisma.chatMessageReaction.upsert({
      where: { messageId_userId: { messageId: msgId, userId } },
      create: { messageId: msgId, userId, emoji },
      update: { emoji },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    emitChatRoom(roomId, 'chat-reaction', { messageId: msgId, roomId, reaction });
    res.status(201).json(reaction);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to add reaction', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

router.delete('/rooms/:roomId/messages/:msgId/reactions', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId, msgId } = req.params;
    const userId = req.user!.id;

    await prisma.chatMessageReaction.deleteMany({
      where: { messageId: msgId, userId },
    });

    emitChatRoom(roomId, 'chat-reaction', { messageId: msgId, roomId, removed: true, userId });
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to remove reaction', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

router.post('/rooms/:roomId/messages/:msgId/star', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId, msgId } = req.params;
    const userId = req.user!.id;

    await prisma.chatMessageStar.upsert({
      where: { messageId_userId: { messageId: msgId, userId } },
      create: { messageId: msgId, userId, roomId },
      update: {},
    });
    res.status(201).json({ success: true });
  } catch (err) {
    logger.error('Failed to star message', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to star message' });
  }
});

router.delete('/rooms/:roomId/messages/:msgId/star', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId: _roomId, msgId } = req.params;
    await prisma.chatMessageStar.deleteMany({
      where: { messageId: msgId, userId: req.user!.id },
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to unstar message', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to unstar message' });
  }
});

export default router;
