import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { authorize, type AuthRequest } from '../middleware/auth.js';
import {
  buildDefaultTemplateVars,
  extractTemplateVariables,
  renderTemplate,
} from '../lib/templateRenderer.js';
import { scheduleEmail, sendEmail } from '../lib/emailService.js';

const router = Router();

const templateSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  serviceTypes: z.array(z.string()).optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  attachPdf: z.boolean().optional(),
});

const sendSchema = z.object({
  clientId: z.string(),
  engagementId: z.string().optional(),
  variables: z.record(z.string()).optional(),
  scheduledAt: z.coerce.date().optional(),
});

// GET /api/templates
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const category = req.query.category as string | undefined;
    const where: { firmId: string; isActive: boolean; category?: string } = {
      firmId: req.user!.firmId!,
      isActive: true,
    };
    if (category) where.category = category;

    const templates = await prisma.documentTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    res.json(templates);
  } catch (err) {
    logger.error('List templates error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// GET /api/templates/sends
router.get('/sends/history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sends = await prisma.templateSend.findMany({
      where: { template: { firmId: req.user!.firmId! } },
      include: {
        template: { select: { id: true, name: true, category: true } },
        client: { select: { id: true, name: true } },
        sentBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { sentAt: 'desc' },
      take: 100,
    });
    res.json(sends);
  } catch (err) {
    logger.error('List template sends error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list template sends' });
  }
});

// GET /api/templates/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tpl = await prisma.documentTemplate.findFirst({
      where: { id: String(req.params.id), firmId: req.user!.firmId! },
    });
    if (!tpl) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(tpl);
  } catch (err) {
    logger.error('Get template error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// POST /api/templates
router.post(
  '/',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = templateSchema.parse(req.body);
      const variables = [
        ...new Set([
          ...extractTemplateVariables(body.subject),
          ...extractTemplateVariables(body.body),
        ]),
      ];
      const tpl = await prisma.documentTemplate.create({
        data: {
          firmId: req.user!.firmId!,
          createdById: req.user!.id,
          name: body.name,
          category: body.category,
          serviceTypes: body.serviceTypes ?? [],
          subject: body.subject,
          body: body.body,
          attachPdf: body.attachPdf ?? false,
          variables,
        },
      });
      res.status(201).json(tpl);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Create template error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to create template' });
    }
  }
);

// PUT /api/templates/:id
router.put(
  '/:id',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = templateSchema.partial().parse(req.body);
      const existing = await prisma.documentTemplate.findFirst({
        where: { id: String(req.params.id), firmId: req.user!.firmId! },
      });
      if (!existing) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      const subject = body.subject ?? existing.subject;
      const content = body.body ?? existing.body;
      const variables = [
        ...new Set([...extractTemplateVariables(subject), ...extractTemplateVariables(content)]),
      ];

      const tpl = await prisma.documentTemplate.update({
        where: { id: existing.id },
        data: {
          ...body,
          variables,
        },
      });
      res.json(tpl);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Update template error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to update template' });
    }
  }
);

// DELETE /api/templates/:id — soft delete
router.delete(
  '/:id',
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const existing = await prisma.documentTemplate.findFirst({
        where: { id: String(req.params.id), firmId: req.user!.firmId! },
      });
      if (!existing) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }
      await prisma.documentTemplate.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      res.json({ ok: true });
    } catch (err) {
      logger.error('Delete template error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to delete template' });
    }
  }
);

// POST /api/templates/:id/send
router.post(
  '/:id/send',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = sendSchema.parse(req.body);
      const tpl = await prisma.documentTemplate.findFirst({
        where: { id: String(req.params.id), firmId: req.user!.firmId!, isActive: true },
      });
      if (!tpl) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      const client = await prisma.client.findFirst({
        where: { id: body.clientId, firmId: req.user!.firmId! },
        include: { firm: true },
      });
      if (!client) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      if (!client.contactEmail) {
        res.status(400).json({ error: 'Client has no contact email' });
        return;
      }

      const vars = {
        ...buildDefaultTemplateVars({ client, firm: client.firm }),
        ...(body.variables ?? {}),
      };
      const filledSubject = renderTemplate(tpl.subject, vars);
      const filledContent = renderTemplate(tpl.body, vars);
      const htmlBody = filledContent.split('\n').map((l) => `<p style="margin:0 0 8px">${l || '&nbsp;'}</p>`).join('');

      const emailParams = {
        to: client.contactEmail,
        subject: filledSubject,
        body: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${htmlBody}</div>`,
        clientId: client.id,
        engagementId: body.engagementId,
        templateKey: tpl.category,
      };

      if (body.scheduledAt) {
        const send = await prisma.templateSend.create({
          data: {
            templateId: tpl.id,
            clientId: client.id,
            engagementId: body.engagementId,
            filledSubject,
            filledContent,
            sentById: req.user!.id,
            deliveryStatus: 'scheduled',
            scheduledAt: body.scheduledAt,
          },
        });
        try {
          await scheduleEmail(
            { ...emailParams, metadata: { templateSendId: send.id } },
            body.scheduledAt
          );
        } catch (err) {
          await prisma.templateSend.update({
            where: { id: send.id },
            data: { deliveryStatus: 'failed' },
          });
          throw err;
        }
        res.status(201).json(send);
        return;
      }

      await sendEmail(emailParams);

      const send = await prisma.templateSend.create({
        data: {
          templateId: tpl.id,
          clientId: client.id,
          engagementId: body.engagementId,
          filledSubject,
          filledContent,
          sentById: req.user!.id,
          deliveryStatus: 'sent',
        },
      });

      res.status(201).json(send);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Send template error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to send template' });
    }
  }
);

export default router;
