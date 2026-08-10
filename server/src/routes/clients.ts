import { Router, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { optionalString, optionalEmail } from '../lib/zodHelpers.js';
import { getEnv } from '../lib/env.js';
import { generateToken } from '../lib/authSecurity.js';

const router = Router();
router.use(authenticate);

type StaffSnapshot = {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  role: string;
  designation?: string | null;
};

function staffUserMap(staff: StaffSnapshot[]): Map<string, StaffSnapshot> {
  return new Map(staff.map((u) => [u.id, u]));
}

function enrichEngagementUsers<
  T extends {
    partnerInChargeId?: string | null;
    managerId?: string | null;
    articleAssistantId?: string | null;
  },
>(engagements: T[], users: Map<string, StaffSnapshot>) {
  return engagements.map((e) => ({
    ...e,
    partnerInCharge: e.partnerInChargeId ? users.get(e.partnerInChargeId) ?? null : null,
    manager: e.managerId ? users.get(e.managerId) ?? null : null,
    articleAssistant: e.articleAssistantId ? users.get(e.articleAssistantId) ?? null : null,
  }));
}

const clientSchema = z.object({
  name: z.string().min(1),
  cin: optionalString,
  pan: optionalString,
  gstin: optionalString,
  category: optionalString,
  industry: optionalString,
  address: optionalString,
  city: optionalString,
  state: optionalString,
  contactName: optionalString,
  contactEmail: optionalEmail,
  contactPhone: optionalString,
  turnover: optionalString,
});

// GET /api/clients
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, category, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Record<string, unknown> = { firmId: req.user!.firmId! };
    if (search) {
      where.OR = [
        { name: { contains: String(search) } },
        { cin: { contains: String(search) } },
        { pan: { contains: String(search) } },
      ];
    }
    if (category) where.category = String(category);

    const [clients, total] = await Promise.all([
      prisma.client.findMany({ where, skip, take: Number(limit), orderBy: { name: 'asc' } }),
      prisma.client.count({ where }),
    ]);

    res.json({ clients, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    logger.error('List clients error:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /api/clients/overview — client list + incoming requests for assignment
router.get(
  '/overview',
  authorize('Partner', 'Admin', 'Manager', 'Staff'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const firmId = req.user!.firmId!;

      const [clients, unassignedEngagements, staff] = await Promise.all([
        prisma.client.findMany({
          where: { firmId, isActive: true },
          orderBy: { name: 'asc' },
          include: {
            portalUsers: { select: { id: true, email: true, fullName: true, userId: true } },
            engagements: {
              where: { status: { notIn: ['Closed', 'Archived'] } },
              orderBy: { updatedAt: 'desc' },
              take: 3,
              select: {
                id: true,
                title: true,
                type: true,
                financialYear: true,
                status: true,
                currentStage: true,
                partnerInChargeId: true,
                managerId: true,
                articleAssistantId: true,
                letterStatus: true,
                createdAt: true,
              },
            },
            _count: { select: { engagements: true } },
          },
        }),
        prisma.engagement.findMany({
          where: {
            firmId,
            partnerInChargeId: null,
            status: { notIn: ['Closed', 'Archived'] },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            client: {
              select: {
                id: true,
                name: true,
                status: true,
                contactEmail: true,
                contactPhone: true,
                pan: true,
                category: true,
              },
            },
          },
        }),
        prisma.user.findMany({
          where: { firmId, isActive: true, role: { in: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'] } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            initials: true,
            role: true,
            designation: true,
            hierarchyLevel: { select: { code: true } },
          },
          orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
        }),
      ]);

      const prospectClients = clients.filter((c) => c.status === 'Prospect');
      const users = staffUserMap(staff);
      const clientsWithTeam = clients.map((c) => ({
        ...c,
        engagements: enrichEngagementUsers(c.engagements, users),
      }));
      const unassignedWithTeam = enrichEngagementUsers(unassignedEngagements, users);

      res.json({
        clients: clientsWithTeam,
        incoming: {
          prospectClients,
          unassignedEngagements: unassignedWithTeam,
          total: prospectClients.length + unassignedWithTeam.length,
        },
        staff,
      });
    } catch (err) {
      logger.error('Clients overview error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to load clients overview' });
    }
  }
);

// PATCH /api/clients/:id/activate — mark self-registered client as Active
router.patch(
  '/:id/activate',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await prisma.client.updateMany({
        where: { id: req.params.id, firmId: req.user!.firmId! },
        data: { status: 'Active', onboardedAt: new Date() },
      });
      if (result.count === 0) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      const updated = await prisma.client.findUnique({ where: { id: req.params.id } });
      res.json(updated);
    } catch (err) {
      logger.error('Activate client error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to activate client' });
    }
  }
);

// PATCH /api/clients/:id/recurring-automation — opt out of recurring scheduler
router.patch(
  '/:id/recurring-automation',
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = z.object({ disabled: z.boolean() }).parse(req.body);
      const result = await prisma.client.updateMany({
        where: { id: req.params.id, firmId: req.user!.firmId! },
        data: { recurringAutomationDisabled: body.disabled },
      });
      if (result.count === 0) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      const updated = await prisma.client.findUnique({ where: { id: req.params.id } });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Recurring automation toggle error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to update recurring automation' });
    }
  }
);

const portalHandoffSchema = z.object({ engagementId: z.string().optional() });

/** POST /api/clients/:id/portal-handoff — short-lived staff → client portal session */
router.post(
  '/:id/portal-handoff',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const clientId = String(req.params.id);
      const firmId = req.user!.firmId!;
      const body = portalHandoffSchema.parse(req.body ?? {});

      const client = await prisma.client.findFirst({
        where: { id: clientId, firmId },
        select: { id: true, contactEmail: true },
      });
      if (!client) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }

      const portalUser = await prisma.clientPortalUser.findFirst({
        where: { clientId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!portalUser?.userId) {
        res.status(404).json({
          error: 'No client portal login is linked for this client. Set up portal access during onboarding.',
          portalEmail: portalUser?.email ?? client.contactEmail ?? null,
        });
        return;
      }

      const user = await prisma.user.findFirst({
        where: { id: portalUser.userId, role: 'Client', isActive: true },
      });
      if (!user) {
        res.status(404).json({ error: 'Client portal account is not active. Contact your administrator.' });
        return;
      }

      const handoffToken = jwt.sign(
        {
          typ: 'portal_handoff',
          userId: user.id,
          staffId: req.user!.id,
          clientId,
          engagementId: body.engagementId ?? null,
          jti: generateToken(16),
        },
        getEnv().JWT_SECRET,
        { expiresIn: '2m' }
      );

      await prisma.auditLog.create({
        data: {
          action: 'STAFF_PORTAL_HANDOFF',
          entity: 'Client',
          entityId: clientId,
          userId: req.user!.id,
          details: JSON.stringify({
            engagementId: body.engagementId ?? null,
            portalEmail: portalUser.email,
            clientUserId: user.id,
          }),
          ipAddress: req.ip,
        },
      });

      const params = new URLSearchParams({ handoff: handoffToken, tab: 'documents' });
      if (body.engagementId) params.set('engagementId', body.engagementId);

      res.json({
        url: `/client/dashboard?${params.toString()}`,
        portalEmail: portalUser.email,
        portalUserName: portalUser.fullName,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Portal handoff error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to open client portal' });
    }
  }
);

// GET /api/clients/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, firmId: req.user!.firmId! },
      include: { engagements: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }
    res.json(client);
  } catch (err) {
    logger.error('Get client error:', err);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// POST /api/clients
router.post('/', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = clientSchema.parse(req.body);
    const client = await prisma.client.create({
      data: { ...data, firmId: req.user!.firmId! },
    });
    res.status(201).json(client);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    logger.error('Create client error:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/clients/:id
router.put('/:id', authorize('Partner', 'Manager'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = clientSchema.partial().parse(req.body);
    const client = await prisma.client.updateMany({
      where: { id: req.params.id, firmId: req.user!.firmId! },
      data,
    });
    if (client.count === 0) { res.status(404).json({ error: 'Client not found' }); return; }
    const updated = await prisma.client.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: err.errors }); return; }
    logger.error('Update client error:', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', authorize('Partner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await prisma.client.updateMany({
      where: { id: req.params.id, firmId: req.user!.firmId! },
      data: { isActive: false },
    });
    if (result.count === 0) { res.status(404).json({ error: 'Client not found' }); return; }
    res.json({ message: 'Client deactivated' });
  } catch (err) {
    logger.error('Delete client error:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;
