import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { provisionClientFolders } from '../lib/folderProvisioner.js';
import { sendEmail, emailTemplates } from '../lib/emailService.js';
import { getEnv } from '../lib/env.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

// Default KYC documents required for every new Indian client
const DEFAULT_KYC_DOCS = [
  'PAN Card',
  'GST Certificate',
  'CIN / Incorporation Certificate',
  'MOA',
  'AOA',
  'Address Proof',
  'Board Resolution',
  'Authorised Signatory KYC',
];

const DEFAULT_PORTAL_CHECKLIST = [
  'Latest audited financial statements',
  'Trial balance for current year',
  'Bank statements (April to March)',
  'GST returns filed (GSTR-1 / 3B)',
  'TDS returns and challans',
  'Last year ITR acknowledgement',
];

const onboardingSchema = z.object({
  // Core
  name: z.string().min(1, 'Name is required'),
  legalName: z.string().optional(),
  pan: z.string().optional(),
  gstin: z.string().optional(),
  cin: z.string().optional(),
  category: z.string().optional(),
  industry: z.string().optional(),
  // Address
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  // Contact
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  // Status & COI
  status: z.enum(['Active', 'Inactive', 'Prospect']).default('Prospect'),
  conflictOfInterest: z.boolean().default(false),
  conflictNotes: z.string().optional(),
  // Portal user (optional, created if email provided)
  createPortalUser: z.boolean().default(false),
});

/** POST /api/onboarding — create client with full onboarding flow */
router.post(
  '/',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = onboardingSchema.parse(req.body);
      const firmId = req.user!.firmId!;
      if (!firmId) {
        res.status(400).json({ error: 'No firm associated with user' });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: {
            firmId,
            name: data.name,
            legalName: data.legalName,
            pan: data.pan,
            gstin: data.gstin,
            cin: data.cin,
            category: data.category,
            industry: data.industry,
            address: data.address,
            city: data.city,
            state: data.state,
            contactName: data.contactName,
            contactEmail: data.contactEmail || undefined,
            contactPhone: data.contactPhone,
            status: data.status,
            conflictOfInterest: data.conflictOfInterest,
            conflictNotes: data.conflictNotes,
            conflictCheckedById: data.conflictOfInterest ? req.user!.id : undefined,
            conflictCheckedAt: data.conflictOfInterest ? new Date() : undefined,
            onboardedAt: data.status === 'Active' ? new Date() : undefined,
          },
        });

        // Seed KYC checklist
        await tx.kycDocument.createMany({
          data: DEFAULT_KYC_DOCS.map((docType) => ({
            clientId: client.id,
            docType,
            status: 'Pending',
          })),
        });

        return client;
      });

      // Provision file folders (non-transactional — filesystem side effect)
      const year = new Date().getFullYear();
      let folderPath: string | null = null;
      try {
        folderPath = await provisionClientFolders(result.name, year);
        await prisma.client.update({
          where: { id: result.id },
          data: { folderPath },
        });
      } catch (err) {
        logger.warn('Folder provisioning failed (non-fatal)', { error: (err as Error).message });
      }

      // Create portal user + send welcome email
      let portalCredentials: { email: string; tempPassword: string } | null = null;
      if (data.createPortalUser && data.contactEmail) {
        const existing = await prisma.clientPortalUser.findUnique({
          where: { email: data.contactEmail },
        });
        if (!existing) {
          const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);
          await prisma.clientPortalUser.create({
            data: {
              clientId: result.id,
              email: data.contactEmail,
              passwordHash: await bcrypt.hash(tempPassword, 12),
              fullName: data.contactName || data.name,
              mobile: data.contactPhone,
            },
          });
          portalCredentials = { email: data.contactEmail, tempPassword };

          const firm = await prisma.firm.findUnique({ where: { id: firmId } });
          const { subject, body } = emailTemplates.welcome({
            firmName: firm?.name || 'AuditIQ',
            clientName: data.contactName || data.name,
            portalUrl: `${getEnv().CLIENT_URL.replace(/\/$/, '')}/portal`,
            loginEmail: data.contactEmail,
            tempPassword,
            documentChecklist: DEFAULT_PORTAL_CHECKLIST,
          });
          void sendEmail({
            to: data.contactEmail,
            subject,
            body,
            clientId: result.id,
            templateKey: 'welcome',
          });
        }
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'CREATE',
          entity: 'Client',
          entityId: result.id,
          details: JSON.stringify({ via: 'onboarding', conflictOfInterest: data.conflictOfInterest }),
        },
      });

      res.status(201).json({
        client: result,
        folderPath,
        portalUserCreated: Boolean(portalCredentials),
        portalEmail: portalCredentials?.email ?? null,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Onboarding failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to onboard client' });
    }
  }
);

/** GET /api/onboarding/defaults — return default checklists for the wizard */
router.get('/defaults', (_req, res) => {
  res.json({ kycDocuments: DEFAULT_KYC_DOCS, portalChecklist: DEFAULT_PORTAL_CHECKLIST });
});

/**
 * POST /api/onboarding/:clientId/conflict-check
 * Partner marks/unmarks COI on a client. Only Partners can override an existing COI.
 */
router.post(
  '/:clientId/conflict-check',
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const schema = z.object({ conflictOfInterest: z.boolean(), notes: z.string().optional() });
      const body = schema.parse(req.body);
      const updated = await prisma.client.updateMany({
        where: { id: String(req.params.clientId), firmId: req.user!.firmId! },
        data: {
          conflictOfInterest: body.conflictOfInterest,
          conflictNotes: body.notes,
          conflictCheckedById: req.user!.id,
          conflictCheckedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Conflict check failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to update conflict check' });
    }
  }
);

export default router;
