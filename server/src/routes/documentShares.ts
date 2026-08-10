import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { prisma } from '../index.js';
import { authenticate, requireStaff, AuthRequest } from '../middleware/auth.js';
import { getEnv } from '../lib/env.js';
import logger from '../lib/logger.js';
import { shareRecipientMatches } from '../lib/shareAccess.js';

const router = Router();
// NOTE: no global authenticate here — /access/:token and /info/:token are
// intentionally public (protected by unguessable token + optional password + expiry).
// All other routes apply `authenticate` explicitly.

// ─── Create share link ───

const shareSchema = z.object({
  documentId: z.string().uuid(),
  expiresInHours: z.number().int().min(1).max(720).default(24),
  password: z.string().min(8, 'Share password must be at least 8 characters').optional(),
  maxAccess: z.number().int().min(1).optional(),
  sharedWithEmail: z.string().email().optional(),
});

// POST /api/document-shares
router.post('/', authenticate, requireStaff, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = shareSchema.parse(req.body);

    if (!req.user!.firmId) {
      res.status(400).json({ error: 'Your account is not linked to a firm' });
      return;
    }
    const doc = await prisma.document.findFirst({
      where: { id: data.documentId, firmId: req.user!.firmId },
    });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const expiresAt = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);
    const hashedPassword = data.password ? await bcrypt.hash(data.password, 12) : null;

    const share = await prisma.documentShare.create({
      data: {
        documentId: data.documentId,
        sharedById: req.user!.id,
        expiresAt,
        password: hashedPassword,
        maxAccess: data.maxAccess || null,
        sharedWithEmail: data.sharedWithEmail || null,
      },
    });

    res.status(201).json({
      id: share.id,
      shareToken: share.shareToken,
      expiresAt: share.expiresAt,
      maxAccess: share.maxAccess,
      shareUrl: `/shared/${share.shareToken}`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to create share', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// GET /api/document-shares — list shares created by user
router.get('/', authenticate, requireStaff, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const shares = await prisma.documentShare.findMany({
      where: { sharedById: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch document names (no relation defined — manual join)
    const docIds = [...new Set(shares.map(s => s.documentId))];
    const docs = await prisma.document.findMany({
      where: { id: { in: docIds } },
      select: { id: true, fileName: true, originalName: true, mimeType: true, size: true },
    });
    const docMap = new Map(docs.map(d => [d.id, d]));

    res.json(shares.map(s => {
      const doc = docMap.get(s.documentId);
      return {
        id: s.id,
        shareToken: s.shareToken,
        documentName: doc?.originalName || doc?.fileName || 'Unknown',
        expiresAt: s.expiresAt,
        maxAccess: s.maxAccess,
        accessCount: s.accessCount,
        isActive: s.isActive,
        shareUrl: `/shared/${s.shareToken}`,
        createdAt: s.createdAt,
      };
    }));
  } catch (err) {
    logger.error('Failed to list shares', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list shares' });
  }
});

// DELETE /api/document-shares/:id — revoke share
router.delete('/:id', authenticate, requireStaff, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const share = await prisma.documentShare.findUnique({ where: { id: req.params.id } });
    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    const doc = await prisma.document.findFirst({
      where: { id: share.documentId, firmId: req.user!.firmId ?? '__none__' },
      select: { id: true },
    });
    if (!doc) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    // Only owner or same-firm admins can revoke
    if (share.sharedById !== req.user!.id && !['Partner', 'Admin'].includes(req.user!.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await prisma.documentShare.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to revoke share', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to revoke share' });
  }
});

// ─── Public access (no auth required) ───

// In-memory brute-force guard for share passwords: 10 wrong attempts per
// token per 15 minutes. Resets on process restart, which is acceptable for
// short-lived share links.
const SHARE_ATTEMPT_LIMIT = 10;
const SHARE_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const shareAttempts = new Map<string, { count: number; windowStart: number }>();

function shareAttemptsExceeded(token: string): boolean {
  const entry = shareAttempts.get(token);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > SHARE_ATTEMPT_WINDOW_MS) {
    shareAttempts.delete(token);
    return false;
  }
  return entry.count >= SHARE_ATTEMPT_LIMIT;
}

async function viewerEmailFromRequest(req: AuthRequest): Promise<string | undefined> {
  if (req.user?.email) return req.user.email;
  const token =
    req.cookies?.auditiq_token ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return undefined;
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET, { algorithms: ['HS256'] }) as { id?: string };
    if (!payload.id) return undefined;
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { email: true, isActive: true },
    });
    return user?.isActive ? user.email : undefined;
  } catch {
    return undefined;
  }
}

function recordShareFailure(token: string): void {
  const now = Date.now();
  const entry = shareAttempts.get(token);
  if (!entry || now - entry.windowStart > SHARE_ATTEMPT_WINDOW_MS) {
    shareAttempts.set(token, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
  // Bound the map so abandoned tokens don't accumulate forever
  if (shareAttempts.size > 10000) {
    for (const [key, value] of shareAttempts) {
      if (now - value.windowStart > SHARE_ATTEMPT_WINDOW_MS) shareAttempts.delete(key);
    }
  }
}

async function accessSharedDocument(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    const password =
      req.method === 'POST'
        ? z.object({ password: z.string().optional() }).parse(req.body ?? {}).password
        : undefined;

    const share = await prisma.documentShare.findUnique({
      where: { shareToken: token },
    });

    if (!share || !share.isActive) {
      res.status(404).json({ error: 'Share link not found or has been revoked' });
      return;
    }

    // Check expiry
    if (share.expiresAt && new Date() > share.expiresAt) {
      res.status(410).json({ error: 'Share link has expired' });
      return;
    }

    // Check access limit
    if (share.maxAccess && share.accessCount >= share.maxAccess) {
      res.status(410).json({ error: 'Access limit reached' });
      return;
    }

    const viewerEmail = await viewerEmailFromRequest(req);
    if (!shareRecipientMatches(share.sharedWithEmail, viewerEmail)) {
      res.status(403).json({
        error: 'This link is restricted to a specific recipient. Sign in with that account.',
        requiresAuth: true,
      });
      return;
    }

    // Check password (bcrypt compare) with brute-force lockout.
    // Password must arrive in the POST body — never as a GET query string.
    if (share.password) {
      if (req.method !== 'POST') {
        res.status(405).json({
          error: 'Password-protected shares must be accessed via POST',
          requiresPassword: true,
        });
        return;
      }
      if (shareAttemptsExceeded(token)) {
        res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
        return;
      }
      const pwInput = String(password || '');
      if (!pwInput || !(await bcrypt.compare(pwInput, share.password))) {
        recordShareFailure(token);
        res.status(401).json({ error: 'Invalid password', requiresPassword: true });
        return;
      }
      shareAttempts.delete(token);
    }

    // Fetch the actual document (no relation in schema)
    const doc = await prisma.document.findUnique({ where: { id: share.documentId } });
    if (!doc) {
      res.status(404).json({ error: 'Document no longer exists' });
      return;
    }

    const bumped = await prisma.documentShare.updateMany({
      where: {
        id: share.id,
        isActive: true,
        ...(share.maxAccess != null ? { accessCount: { lt: share.maxAccess } } : {}),
      },
      data: { accessCount: { increment: 1 } },
    });
    if (bumped.count === 0) {
      res.status(410).json({ error: 'Access limit reached' });
      return;
    }

    if (!doc.storagePath || !fs.existsSync(doc.storagePath)) {
      res.status(404).json({ error: 'File missing from server disk' });
      return;
    }

    res.download(path.resolve(doc.storagePath), doc.originalName);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error('Failed to access shared document', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to access document' });
  }
}

// GET /api/document-shares/access/:token — unpassworded shares only
router.get('/access/:token', accessSharedDocument);
// POST /api/document-shares/access/:token — password in body, never in the query string
router.post('/access/:token', accessSharedDocument);

// GET /api/document-shares/info/:token — get share info without downloading
router.get('/info/:token', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const share = await prisma.documentShare.findUnique({
      where: { shareToken: req.params.token },
    });

    if (!share || !share.isActive) {
      res.status(404).json({ error: 'Share link not found' });
      return;
    }

    // Fetch document and sharer info separately (no relation in schema)
    const [doc, sharer] = await Promise.all([
      prisma.document.findUnique({
        where: { id: share.documentId },
        select: { fileName: true, originalName: true, mimeType: true, size: true },
      }),
      prisma.user.findUnique({
        where: { id: share.sharedById },
        select: { firstName: true, lastName: true },
      }),
    ]);

    const requiresPassword = !!share.password;
    const requiresAuth = !!share.sharedWithEmail;
    const viewerEmail = await viewerEmailFromRequest(req);
    const recipientOk = shareRecipientMatches(share.sharedWithEmail, viewerEmail);
    res.json({
      requiresPassword,
      requiresAuth,
      isExpired: share.expiresAt ? new Date() > share.expiresAt : false,
      expiresAt: share.expiresAt,
      ...(requiresPassword || !recipientOk
        ? {}
        : {
            documentName: doc?.originalName || doc?.fileName || 'Unknown',
            mimeType: doc?.mimeType,
            size: doc?.size,
            sharedBy: sharer ? `${sharer.firstName} ${sharer.lastName}` : 'Unknown',
            accessRemaining: share.maxAccess ? share.maxAccess - share.accessCount : null,
          }),
    });
  } catch (err) {
    logger.error('Failed to get share info', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get share info' });
  }
});

export default router;
