import { Router, Response } from 'express';
import fs from 'fs';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { authorize, type AuthRequest } from '../middleware/auth.js';
import {
  generateEngagementLetter,
  resolveEngagementLetterDocxPath,
  revertStaffPrematureLetterSignatures,
  sendEngagementLetter,
  signEngagementLetter,
  updateEngagementLetterDraft,
} from '../use-cases/engagementLetterWorkflow.js';
import { handleUseCaseError } from '../use-cases/handleUseCaseError.js';
import { requireEngagementAccess } from '../lib/engagementAccess.js';

const router = Router();

const feeLineSchema = z.object({
  particular: z.string(),
  amount: z.string(),
});

const generateSchema = z.object({
  engagementId: z.string(),
  templateId: z.string().optional(),
  fees: z.array(feeLineSchema).optional(),
  partnerName: z.string().optional(),
  scopeOfServices: z.string().optional(),
  scopeAndProcess: z.string().optional(),
});

const updateSchema = z.object({
  generatedContent: z.string().min(1),
  subjectLine: z.string().optional(),
  fees: z.array(feeLineSchema).optional(),
  partnerName: z.string().optional(),
});

const signSchema = z.object({
  signedDocumentUrl: z.string().optional(),
});

function streamLetterDocx(res: Response, filePath: string, downloadName: string): void {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
  fs.createReadStream(filePath).pipe(res);
}

// POST /api/engagement-letters/generate
router.post(
  '/generate',
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = generateSchema.parse(req.body);
      const result = await generateEngagementLetter({
        engagementId: body.engagementId,
        firmId: req.user!.firmId!,
        userId: req.user!.id,
        templateId: body.templateId,
        fees: body.fees,
        partnerName: body.partnerName,
        scopeOfServices: body.scopeOfServices,
        scopeAndProcess: body.scopeAndProcess,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      handleUseCaseError(
        err,
        res,
        'Generate engagement letter error',
        'Failed to generate engagement letter'
      );
    }
  }
);

// GET /api/engagement-letters/by-engagement/:engagementId — before /:id
router.get(
  '/by-engagement/:engagementId',
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const engagementId = String(req.params.engagementId);
      if (!(await requireEngagementAccess(req, res, engagementId))) return;
      const eng = await prisma.engagement.findFirst({
        where: { id: engagementId, firmId: req.user!.firmId! },
        select: { clientId: true },
      });
      if (eng) {
        await revertStaffPrematureLetterSignatures(eng.clientId);
      }

      const letter = await prisma.engagementLetter.findFirst({
        where: {
          engagementId,
          engagement: { firmId: req.user!.firmId! },
        },
      });
      res.json(letter ?? null);
    } catch (err) {
      logger.error('Get engagement letter by engagement error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to get engagement letter' });
    }
  }
);

// GET /api/engagement-letters/:id/docx — before /:id
router.get('/:id/docx', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const letter = await prisma.engagementLetter.findFirst({
      where: {
        id: String(req.params.id),
        engagement: { firmId: req.user!.firmId! },
      },
      include: { engagement: { select: { title: true } } },
    });
    if (!letter) {
      res.status(404).json({ error: 'Engagement letter not found' });
      return;
    }
    if (!(await requireEngagementAccess(req, res, letter.engagementId))) return;
    const docxPath = resolveEngagementLetterDocxPath(letter);
    if (!docxPath) {
      res.status(404).json({ error: 'Word document not available yet. Save or regenerate the letter.' });
      return;
    }
    const safeName = `${letter.engagement.title.replace(/[^\w.-]+/g, '_')}-engagement-letter.docx`;
    streamLetterDocx(res, docxPath, safeName);
  } catch (err) {
    logger.error('Get engagement letter DOCX error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load engagement letter document' });
  }
});

// PATCH /api/engagement-letters/:id — edit draft
router.patch(
  '/:id',
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = updateSchema.parse(req.body);
      const updated = await updateEngagementLetterDraft({
        letterId: String(req.params.id),
        firmId: req.user!.firmId!,
        generatedContent: body.generatedContent,
        subjectLine: body.subjectLine,
        fees: body.fees,
        partnerName: body.partnerName,
      });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      handleUseCaseError(err, res, 'Update engagement letter error', 'Failed to update engagement letter');
    }
  }
);

// GET /api/engagement-letters/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const letter = await prisma.engagementLetter.findFirst({
      where: {
        id: String(req.params.id),
        engagement: { firmId: req.user!.firmId! },
      },
      include: {
        engagement: { select: { id: true, title: true, letterStatus: true } },
        client: { select: { id: true, name: true, contactEmail: true } },
        template: { select: { id: true, name: true } },
      },
    });
    if (!letter) {
      res.status(404).json({ error: 'Engagement letter not found' });
      return;
    }
    if (!(await requireEngagementAccess(req, res, letter.engagementId))) return;
    res.json(letter);
  } catch (err) {
    logger.error('Get engagement letter error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get engagement letter' });
  }
});

// POST /api/engagement-letters/:id/send
router.post(
  '/:id/send',
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const updated = await sendEngagementLetter(String(req.params.id), req.user!.firmId!);
      res.json(updated);
    } catch (err) {
      handleUseCaseError(err, res, 'Send engagement letter error', 'Failed to send engagement letter');
    }
  }
);

// PATCH /api/engagement-letters/:id/sign
router.patch(
  '/:id/sign',
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = signSchema.parse(req.body ?? {});
      const updated = await signEngagementLetter({
        letterId: String(req.params.id),
        firmId: req.user!.firmId!,
        userId: req.user!.id,
        signedDocumentUrl: body.signedDocumentUrl,
      });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      handleUseCaseError(err, res, 'Sign engagement letter error', 'Failed to mark engagement letter signed');
    }
  }
);

export default router;
