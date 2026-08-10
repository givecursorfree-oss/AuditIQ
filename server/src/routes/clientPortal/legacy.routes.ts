import { Router, Response } from 'express';
import { prisma } from '../../index.js';
import logger from '../../lib/logger.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { notifyClientPortalUsers } from '../../lib/clientScope.js';
import { getClientPortalScope } from './shared.js';

const router = Router();

// Map user-facing service types to internal engagement types
const SERVICE_TYPE_MAP: Record<string, string> = {
  'Income Tax Return (ITR) Filing': 'Tax (44AB)',
  'ITR': 'Tax (44AB)',
  'GST Compliance (Monthly / Annual)': 'GST',
  'GST': 'GST',
  'Statutory Audit': 'Statutory',
  'Statutory': 'Statutory',
  'Tax Audit (Section 44AB)': 'Tax (44AB)',
  'Tax (44AB)': 'Tax (44AB)',
  'Internal Audit': 'Internal',
  'Internal': 'Internal',
  'TDS / TCS Compliance': 'GST',
  'TDS/TCS': 'GST',
  'Business Valuation': 'Special',
  'Valuation': 'Special',
  'International Tax / Transfer Pricing': 'Special',
  'International Tax': 'Special',
  'Other': 'Special',
};

// POST /api/client/engagement-requests — legacy single-service (creates ClientRequest)
router.post('/engagement-requests', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getClientPortalScope(req, res);
    if (!scope) return;
    const clientId = scope.clientId;

    const { serviceType, type, financialYear, description, notes, selectedServices } = req.body;
    const fy = financialYear;
    if (!fy) {
      res.status(400).json({ error: 'Financial year is required' });
      return;
    }

    const SERVICE_LABEL_TO_CODE: Record<string, string> = {
      'Income Tax Return (ITR)': 'ITR_JULY',
      ITR: 'ITR_JULY',
      'GST compliance': 'GSTR_3B',
      GST: 'GSTR_3B',
      'Statutory audit': 'STATUTORY_AUDIT',
      Statutory: 'STATUTORY_AUDIT',
      'Tax audit (Section 44AB)': 'TAX_AUDIT_44AB',
      'Tax (44AB)': 'TAX_AUDIT_44AB',
      'TDS / TCS compliance': 'TDS_REMITTANCE',
      'TDS/TCS': 'TDS_REMITTANCE',
      'Business valuation': 'STATUTORY_AUDIT',
      Valuation: 'STATUTORY_AUDIT',
      'International tax': 'TP_BUNDLE',
      'International Tax': 'TP_BUNDLE',
    };

    const services: string[] = Array.isArray(selectedServices)
      ? selectedServices
      : [SERVICE_LABEL_TO_CODE[serviceType] || SERVICE_LABEL_TO_CODE[type] || 'NOTICES'];

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, firmId: true } });
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const request = await prisma.clientRequest.create({
      data: {
        clientId,
        firmId: client.firmId,
        selectedServices: services,
        financialYears: [fy],
        notes: [description, notes].filter(Boolean).join('\n\n') || null,
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
        message: `${client.name} has requested services for FY ${fy}.`,
        type: 'info' as const,
        link: `/requests/${request.id}`,
      })),
    });

    await notifyClientPortalUsers(clientId, {
      title: 'Request submitted',
      message:
        'Your service request has been submitted. The firm will review it and send an engagement letter before assigning your team.',
      link: '/client/dashboard',
      type: 'success',
    }).catch(() => {});

    res.status(201).json({
      ...request,
      message:
        'Your service request has been submitted. The firm will review it and send an engagement letter before assigning your team.',
    });
  } catch (err) {
    logger.error('Client engagement request error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to create engagement request' });
  }
});

export default router;
