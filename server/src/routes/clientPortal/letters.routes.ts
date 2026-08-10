import { Router, Response } from 'express';
import fs from 'fs';
import { prisma } from '../../index.js';
import logger from '../../lib/logger.js';
import type { AuthRequest } from '../../middleware/auth.js';
import {
  acceptEngagementLetterByClient,
  generateEngagementLetter,
  resolveEngagementLetterDocxPath,
  revertStaffPrematureLetterSignatures,
} from '../../use-cases/engagementLetterWorkflow.js';
import { handleUseCaseError } from '../../use-cases/handleUseCaseError.js';
import { getClientPortalScope } from './shared.js';

const router = Router();

type LetterRow = {
  id: string;
  status: string;
  generatedContent: string | null;
  sentAt: Date | null;
  docxPath?: string | null;
  engagement: { id: string; title: string; financialYear: string; letterStatus: string };
};

function streamLetterDocx(res: Response, filePath: string, downloadName: string): void {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
  fs.createReadStream(filePath).pipe(res);
}

async function ensureMissingDraftLetters(clientId: string): Promise<void> {
  const missing = await prisma.engagement.findMany({
    where: {
      clientId,
      letterStatus: 'draft',
      engagementLetter: null,
      clientRequest: { status: 'approved' },
    },
    include: {
      clientRequest: { select: { reviewedById: true } },
    },
    take: 10,
  });
  if (!missing.length) return;

  for (const eng of missing) {
    let userId = eng.clientRequest?.reviewedById ?? null;
    if (!userId) {
      const fallback = await prisma.user.findFirst({
        where: { firmId: eng.firmId, role: { in: ['Partner', 'Admin'] }, isActive: true },
        select: { id: true },
      });
      userId = fallback?.id ?? null;
    }
    if (!userId) continue;
    try {
      await generateEngagementLetter({
        engagementId: eng.id,
        firmId: eng.firmId,
        userId,
      });
    } catch (err) {
      logger.warn('Lazy engagement letter draft generation failed', {
        engagementId: eng.id,
        error: (err as Error).message,
      });
    }
  }
}

async function listPendingSignatureLetters(clientId: string): Promise<LetterRow[]> {
  const letters = await prisma.engagementLetter.findMany({
    where: {
      clientId,
      status: 'sent',
      engagement: { letterStatus: 'sent' },
    },
    include: {
      engagement: { select: { id: true, title: true, financialYear: true, letterStatus: true } },
    },
    orderBy: { sentAt: 'desc' },
  });
  return letters;
}

router.get('/engagement-letters/inbox', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    await revertStaffPrematureLetterSignatures(scope.clientId);
    await ensureMissingDraftLetters(scope.clientId);

    const awaitingSignature = await listPendingSignatureLetters(scope.clientId);

    const inPreparation = await prisma.engagement.findMany({
      where: {
        clientId: scope.clientId,
        letterStatus: { in: ['draft'] },
        clientRequest: { status: 'approved' },
        OR: [{ engagementLetter: null }, { engagementLetter: { status: 'draft' } }],
      },
      select: {
        id: true,
        title: true,
        financialYear: true,
        letterStatus: true,
        updatedAt: true,
        engagementLetter: { select: { id: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ awaitingSignature, inPreparation });
  } catch (err) {
    logger.error('Client letter inbox error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load engagement letters' });
  }
});

router.get('/engagement-letters/pending', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;
    await revertStaffPrematureLetterSignatures(scope.clientId);
    await ensureMissingDraftLetters(scope.clientId);
    const letters = await listPendingSignatureLetters(scope.clientId);
    res.json(letters);
  } catch (err) {
    logger.error('Client pending letters error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list pending letters' });
  }
});

router.get('/engagement-letters/:id/docx', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const letter = await prisma.engagementLetter.findFirst({
      where: {
        id: String(req.params.id),
        clientId: scope.clientId,
        status: { in: ['sent', 'signed'] },
      },
      include: { engagement: { select: { title: true } } },
    });
    if (!letter) {
      res.status(404).json({ error: 'Engagement letter not found' });
      return;
    }
    const docxPath = resolveEngagementLetterDocxPath(letter);
    if (!docxPath) {
      res.status(404).json({ error: 'Letter document not available. Contact your CA firm.' });
      return;
    }
    const safeName = `${letter.engagement.title.replace(/[^\w.-]+/g, '_')}-engagement-letter.docx`;
    streamLetterDocx(res, docxPath, safeName);
  } catch (err) {
    logger.error('Client engagement letter DOCX error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load engagement letter document' });
  }
});

router.get('/engagement-letters/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const letter = await prisma.engagementLetter.findFirst({
      where: {
        id: String(req.params.id),
        clientId: scope.clientId,
        status: { in: ['sent', 'signed'] },
      },
      include: {
        engagement: { select: { id: true, title: true, financialYear: true, letterStatus: true } },
      },
    });
    if (!letter) {
      res.status(404).json({ error: 'Engagement letter not found or not yet available for review' });
      return;
    }
    res.json(letter);
  } catch (err) {
    logger.error('Client get engagement letter error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load engagement letter' });
  }
});

router.patch(
  '/engagement-letters/:id/accept',
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const scope = await getClientPortalScope(req, res);
      if (!scope) return;

      const signatoryName = String(req.body?.signatoryName ?? '').trim();
      if (!signatoryName) {
        res.status(400).json({ error: 'Authorised signatory name is required.' });
        return;
      }

      const updated = await acceptEngagementLetterByClient(
        String(req.params.id),
        scope.clientId,
        signatoryName
      );
      res.json(updated);
    } catch (err) {
      handleUseCaseError(
        err,
        res,
        'Client accept engagement letter error',
        'Failed to accept engagement letter'
      );
    }
  }
);

export default router;
