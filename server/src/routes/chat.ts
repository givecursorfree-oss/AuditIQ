import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { resolveClientIdForPortalUser } from '../lib/clientScope.js';
import { isIndianBusinessHours, AFTER_HOURS_AUTO_REPLY } from '../lib/businessHours.js';

const router = Router();
// No fileSize cap — attachments stored in DB (LongBlob, up to ~4GB MySQL limit)
const upload = multer({ storage: multer.memoryStorage() });

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

type RoomWithParticipants = {
  id: string;
  name: string | null;
  type: string;
  engagementId: string | null;
  updatedAt: Date;
  participants: {
    userId: string;
    role: string;
    lastReadAt: Date;
    user: { id: string; firstName: string; lastName: string; initials: string };
  }[];
  messages?: {
    id: string;
    content: string;
    createdAt: Date;
    sender: { firstName: string; lastName: string };
  }[];
};

async function formatChatRoom(room: RoomWithParticipants, userId: string) {
  const participant = room.participants.find((p) => p.userId === userId);
  const lastRead = participant?.lastReadAt || new Date(0);
  const unreadCount = await prisma.chatMessage.count({
    where: {
      roomId: room.id,
      createdAt: { gt: lastRead },
      senderId: { not: userId },
    },
  });
  const last = room.messages?.[0];
  return {
    id: room.id,
    name: room.name,
    type: room.type === 'group' && room.engagementId ? 'CHANNEL' : room.type === 'direct' ? 'DM' : 'GROUP',
    engagementId: room.engagementId,
    participants: room.participants.map((p) => ({
      userId: p.user.id,
      user: {
        id: p.user.id,
        name: `${p.user.firstName} ${p.user.lastName}`,
        email: '',
        initials: p.user.initials,
        presenceStatus: p.user.presenceStatus || 'online',
      },
      role: p.role,
    })),
    lastMessage: last
      ? {
          id: last.id,
          content: last.content,
          createdAt: last.createdAt.toISOString(),
          type: 'TEXT' as const,
          sender: {
            id: '',
            name: `${last.sender.firstName} ${last.sender.lastName}`,
            email: '',
            initials: '',
          },
          senderId: '',
        }
      : null,
    unreadCount,
    updatedAt: room.updatedAt.toISOString(),
  };
}

const roomInclude = {
  participants: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          initials: true,
          presenceStatus: true,
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
      sender: { select: { firstName: true, lastName: true } },
    },
  },
};

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
      const scope = await resolveClientIdForPortalUser(userId, user?.email ?? '', user?.firmId ?? null);
      if (!scope.clientId) {
        res.json([]);
        return;
      }
      const engagements = await prisma.engagement.findMany({
        where: { clientId: scope.clientId },
        select: { id: true },
      });
      clientEngagementIds = engagements.map((e) => e.id);
    }

    const rooms = await prisma.chatRoom.findMany({
      where: {
        participants: { some: { userId } },
        ...(isClient
          ? {
              engagementId: { in: clientEngagementIds ?? [] },
            }
          : {}),
      },
      include: {
        participants: {
          include: {
            user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          initials: true,
          presenceStatus: true,
        },
      },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            sender: { select: { firstName: true, lastName: true } },
          },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const result = await Promise.all(
      rooms.map((room) => formatChatRoom(room as RoomWithParticipants, userId))
    );

    res.json(result);
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

    // Verify user is participant
    const participant = await prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: req.user!.id } },
    });
    if (!participant) {
      res.status(403).json({ error: 'Not a member of this room' });
      return;
    }

    const messages = await prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      omit: { fileData: true },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, initials: true } },
      },
    });

    const pins = await prisma.chatPinnedMessage.findMany({
      where: { roomId },
      select: { messageId: true },
    });
    const pinnedIds = new Set(pins.map((p) => p.messageId));

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    // Update last read
    await prisma.chatParticipant.update({
      where: { roomId_userId: { roomId, userId: req.user!.id } },
      data: { lastReadAt: new Date() },
    });

    res.json({
      messages: messages.reverse().map((m) => ({
        ...m,
        isPinned: pinnedIds.has(m.id),
        content: m.isDeleted ? '' : m.content,
        fileName: m.isDeleted ? null : m.fileName,
        fileSize: m.isDeleted ? null : m.fileSize,
        fileMimeType: m.isDeleted ? null : m.fileMimeType,
      })),
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
      messageType: z.enum(['text', 'file', 'system']).default('text'),
      parentId: z.string().uuid().optional(),
    });

    const data = msgSchema.parse(req.body);

    // Verify membership
    const participant = await prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant) {
      res.status(403).json({ error: 'Not a member of this room' });
      return;
    }

    const message = await prisma.chatMessage.create({
      data: {
        roomId,
        senderId: userId,
        content: data.content,
        messageType: data.messageType,
        parentId: data.parentId,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, initials: true } },
      },
    });

    // Update room timestamp
    await prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    // Update sender's last read
    await prisma.chatParticipant.update({
      where: { roomId_userId: { roomId, userId } },
      data: { lastReadAt: new Date() },
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

    res.status(201).json(message);
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

    // Verify membership
    const participant = await prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant) {
      res.status(403).json({ error: 'Not a member of this room' });
      return;
    }

    // Store file directly in chat message
    const message = await prisma.chatMessage.create({
      data: {
        roomId,
        senderId: userId,
        content: file.originalname,
        messageType: 'file',
        fileName: file.originalname,
        fileOriginalName: file.originalname,
        fileMimeType: file.mimetype,
        fileSize: file.size,
        fileData: file.buffer,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, initials: true } },
      },
    });

    await prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    res.status(201).json({
      ...message,
      fileData: undefined,
    });
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

    const participant = await prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant) {
      res.status(403).json({ error: 'Not a member of this room' });
      return;
    }

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
    res.setHeader('Content-Type', message.fileMimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(safeName)}"`
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

    const participant = await prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant) {
      res.status(403).json({ error: 'Not a member of this room' });
      return;
    }

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

    const [sourceParticipant, targetParticipant] = await Promise.all([
      prisma.chatParticipant.findUnique({
        where: { roomId_userId: { roomId, userId } },
      }),
      prisma.chatParticipant.findUnique({
        where: { roomId_userId: { roomId: targetRoomId, userId } },
      }),
    ]);

    if (!sourceParticipant || !targetParticipant) {
      res.status(403).json({ error: 'Not a member of one or both conversations' });
      return;
    }

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
    await prisma.chatParticipant.update({
      where: { roomId_userId: { roomId: req.params.roomId, userId: req.user!.id } },
      data: { lastReadAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to mark as read', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// GET /api/chat/users — list users available for chat (firm members)
router.get('/users', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role === 'Client') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const users = await prisma.user.findMany({
      where: { firmId: req.user!.firmId, isActive: true },
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

    const engagement = await prisma.engagement.findFirst({
      where: { id: engagementId, firmId: req.user!.firmId! },
      select: {
        id: true, title: true, clientId: true,
        partnerInChargeId: true, managerId: true, articleAssistantId: true,
      },
    });
    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }

    // Check if an engagement room already exists
    const existing = await prisma.chatRoom.findFirst({
      where: { engagementId },
    });
    if (existing) {
      res.json(existing);
      return;
    }

    // Build participant list: assigned team + client portal users
    const participantIds = new Set<string>();
    if (engagement.partnerInChargeId) participantIds.add(engagement.partnerInChargeId);
    if (engagement.managerId) participantIds.add(engagement.managerId);
    if (engagement.articleAssistantId) participantIds.add(engagement.articleAssistantId);
    participantIds.add(req.user!.id);

    // Find client portal user(s) for this client
    const portalUsers = await prisma.clientPortalUser.findMany({
      where: { clientId: engagement.clientId, isActive: true },
      select: { userId: true },
    });
    for (const pu of portalUsers) {
      if (pu.userId) participantIds.add(pu.userId);
    }

    const room = await prisma.chatRoom.create({
      data: {
        name: `📂 ${engagement.title}`,
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

export default router;
