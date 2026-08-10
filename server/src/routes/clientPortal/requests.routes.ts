import { Router, Response } from 'express';
import { prisma } from '../../index.js';
import logger from '../../lib/logger.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { notifyClientPortalUsers } from '../../lib/clientScope.js';
import { mapClientRequestRow } from '../../lib/clientRequestMapper.js';
import { getClientPortalScope } from './shared.js';

const router = Router();

// POST /api/client/requests — MKD multi-service request (preferred)
router.post('/requests', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;

    const { selectedServices, financialYears, notes } = req.body;
    const services: string[] = Array.isArray(selectedServices) ? selectedServices : [];
    const years: string[] = Array.isArray(financialYears) ? financialYears : [];

    if (!services.length) {
      res.status(400).json({ error: 'At least one service is required' });
      return;
    }
    if (!years.length) {
      res.status(400).json({ error: 'Financial year is required' });
      return;
    }

    const existingPending = await prisma.clientRequest.findFirst({
      where: {
        clientId: scope.clientId,
        status: 'pending',
        selectedServices: { equals: services },
        financialYears: { equals: years },
      },
      select: { id: true },
    });
    if (existingPending) {
      res.status(409).json({
        error: 'You already have a pending request for this service and financial year. Check your Requests tab.',
      });
      return;
    }

    const client = await prisma.client.findUnique({
      where: { id: scope.clientId },
      select: { name: true, firmId: true },
    });
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const request = await prisma.clientRequest.create({
      data: {
        clientId: scope.clientId,
        firmId: client.firmId,
        selectedServices: services,
        financialYears: years,
        notes: notes ? String(notes) : null,
        status: 'pending',
      },
    });

    const admins = await prisma.user.findMany({
      where: { firmId: client.firmId, role: { in: ['Partner', 'Admin'] }, isActive: true },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: 'New client service request',
        message: `${client.name} submitted a service request for admin review.`,
        type: 'info' as const,
        link: `/requests/${request.id}`,
      })),
    });

    await notifyClientPortalUsers(scope.clientId, {
      title: 'Request submitted',
      message:
        'Your service request has been submitted. The firm will review it and send an engagement letter before assigning your team.',
      link: '/client/dashboard',
      type: 'success',
    }).catch(() => {});

    res.status(201).json(request);
  } catch (err) {
    logger.error('Client service request error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// GET /api/client/requests
router.get('/requests', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;
    const requests = await prisma.clientRequest.findMany({
      where: { clientId: scope.clientId },
      include: {
        engagements: {
          select: { id: true, letterStatus: true, title: true, serviceCode: true, requestStatus: true, status: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
    res.json(requests.map((row) => mapClientRequestRow(row)));
  } catch (err) {
    logger.error('Client list requests error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to list requests' });
  }
});

export default router;
