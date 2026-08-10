import { Response } from 'express';
import multer from 'multer';
import path from 'path';
import { prisma } from '../../index.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { resolveClientIdForPortalUser } from '../../lib/clientScope.js';

export type ClientPortalScope = {
  clientId: string;
  clientName: string | null;
  firmId: string | null;
};

export async function getClientPortalScope(
  req: AuthRequest,
  res: Response
): Promise<ClientPortalScope | null> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, firmId: true },
  });
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return null;
  }
  const scope = await resolveClientIdForPortalUser(user.id, user.email, user.firmId);
  if (!scope.clientId) {
    res.status(403).json({
      error: 'Your account is not linked to a client record. Contact your CA firm.',
    });
    return null;
  }
  return { clientId: scope.clientId, clientName: scope.clientName, firmId: user.firmId };
}

export function requireClientPortalClient(req: AuthRequest, res: Response, next: () => void): void {
  if (req.user?.role !== 'Client') {
    res.status(403).json({ error: 'Access denied. Client role required.' });
    return;
  }
  next();
}

export const CLIENT_ENGAGEMENT_LIST_SELECT_BASE = {
  id: true,
  title: true,
  type: true,
  status: true,
  financialYear: true,
  currentStage: true,
  startDate: true,
  deadline: true,
  createdAt: true,
  filedAt: true,
  partnerInChargeId: true,
  managerId: true,
  articleAssistantId: true,
  client: { select: { name: true } },
  _count: {
    select: {
      documents: true,
      checklistItems: true,
    },
  },
  checklistItems: {
    where: { status: { in: ['Requested', 'Missing'] as string[] } },
    select: { id: true, status: true },
  },
} as const;

export async function listClientEngagements(clientId: string) {
  const withWorkflow = {
    ...CLIENT_ENGAGEMENT_LIST_SELECT_BASE,
    workflowDomain: true,
    serviceCode: true,
  };
  try {
    return await prisma.engagement.findMany({
      where: { clientId },
      orderBy: { updatedAt: 'desc' },
      select: withWorkflow,
    });
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (!msg.includes('workflowDomain') && !msg.includes('serviceCode') && !msg.includes('Unknown field')) {
      throw err;
    }
    const rows = await prisma.engagement.findMany({
      where: { clientId },
      orderBy: { updatedAt: 'desc' },
      select: CLIENT_ENGAGEMENT_LIST_SELECT_BASE,
    });
    return rows.map((row) => ({ ...row, workflowDomain: null, serviceCode: null }));
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'client-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// Clients may upload any document irrespective of what was requested. Rather
// than an allowlist (which blocks legitimate formats), we block only known
// dangerous executable/script extensions. The magic-byte signature check in
// validateUploadOrRemove is the real security gate — it rejects any file whose
// content is actually an executable, even if renamed.
const BLOCKED_UPLOAD_EXTS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.com', '.msi', '.scr', '.cpl', '.jar',
  '.sh', '.bash', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf',
  '.wsh', '.app', '.deb', '.rpm', '.bin', '.run', '.gadget',
  '.html', '.htm', '.xhtml', '.svg', '.xml', '.shtml',
]);

export const clientPortalUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_UPLOAD_EXTS.has(ext)) {
      cb(new Error('Executable and script files are not allowed for security reasons. You can upload documents, spreadsheets, images, archives, and other files (max 25 MB).'));
      return;
    }
    cb(null, true);
  },
});
