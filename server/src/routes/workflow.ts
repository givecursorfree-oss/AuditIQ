import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import {
  WORKFLOW_TEMPLATES,
  SERVICE_CATALOG,
  MKD_HIERARCHY,
  type WorkflowDomain,
  type TemplateId,
} from '../lib/workflowCatalog.js';
import {
  enrichServiceForCatalog,
  serviceRequirementDetail,
  normalizeServiceCode,
  APP_SURFACE_LABELS,
  CATEGORY_LABELS,
} from '../lib/serviceRequirements.js';
import {
  listFirmServices,
  createFirmService,
  updateFirmService,
  archiveFirmService,
  restoreFirmService,
  getFirmServiceByCode,
  validateFirmServiceInput,
  findOrCreateDataRequestTemplate,
} from '../lib/firmServiceCatalog.js';
import prisma from '../lib/prisma.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const serviceBodySchema = z.object({
  code: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(200),
  domain: z.enum(['DT', 'IDT', 'AUDIT']),
  dueRule: z.string().max(200).nullable().optional(),
  recurrence: z.enum(['monthly', 'quarterly', 'annual', 'ad_hoc']).nullable().optional(),
  templateId: z.enum(['DT_COMPLIANCE', 'IDT_GST_RETURN', 'AUDIT_STATUTORY']),
  sortOrder: z.number().int().optional(),
});

/** GET /api/workflow/catalog — templates, services, hierarchy */
async function loadHierarchyLevels() {
  try {
    if (!('hierarchyLevel' in prisma) || !prisma.hierarchyLevel) return [];
    return await prisma.hierarchyLevel.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  } catch {
    return [];
  }
}

async function hierarchyWithMemberCounts(firmId: string | null | undefined) {
  const levels = await loadHierarchyLevels();
  const base =
    levels.length > 0
      ? levels.map((l) => ({
          code: l.code,
          title: l.title,
          sortOrder: l.sortOrder,
          systemRole: l.systemRole,
          id: l.id,
        }))
      : MKD_HIERARCHY.map((l) => ({ ...l }));

  if (!firmId) return base.map((l) => ({ ...l, memberCount: 0 }));

  const grouped = await prisma.user.groupBy({
    by: ['hierarchyLevelId'],
    where: { firmId, isActive: true, hierarchyLevelId: { not: null } },
    _count: { _all: true },
  });
  const byLevelId = new Map(grouped.map((g) => [g.hierarchyLevelId!, g._count._all]));

  if (levels.length > 0) {
    return base.map((l) => ({
      ...l,
      memberCount: 'id' in l && l.id ? byLevelId.get(l.id) ?? 0 : 0,
    }));
  }

  const employees = await prisma.user.findMany({
    where: { firmId, isActive: true },
    select: { role: true, designation: true },
  });
  const roleToCode: Record<string, string> = {
    Partner: 'PARTNER',
    Manager: 'AUDIT_MANAGER',
    Staff: 'AUDIT_EXECUTIVE',
    Intern: 'INTERN',
    Admin: 'PARTNER',
  };

  return base.map((l) => {
    const code = l.code;
    let memberCount = 0;
    if (code && levels.length === 0) {
      memberCount = employees.filter((e) => {
        if (roleToCode[e.role] === code) return true;
        const d = (e.designation ?? '').toLowerCase();
        return d.includes(l.title.split(' ')[0].toLowerCase());
      }).length;
    }
    return { ...l, memberCount };
  });
}

function mapServiceRow(row: {
  id: string;
  code: string;
  domain: string;
  name: string;
  dueRule: string | null;
  recurrence: string | null;
  templateId: string;
  sortOrder: number;
  isSystem: boolean;
  archivedAt: Date | null;
  restoredAt: Date | null;
}) {
  const enriched = enrichServiceForCatalog({
    code: row.code,
    domain: row.domain as WorkflowDomain,
    name: row.name,
    dueRule: row.dueRule ?? undefined,
    recurrence: row.recurrence ?? undefined,
    templateId: row.templateId,
  });
  return {
    ...enriched,
    id: row.id,
    sortOrder: row.sortOrder,
    isSystem: row.isSystem,
    archivedAt: row.archivedAt,
    restoredAt: row.restoredAt,
  };
}

router.get('/catalog', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const firmId = req.user!.firmId;
    const includeArchived = req.query.archived === 'true' || req.query.includeArchived === 'true';
    const archivedOnly = req.query.archived === 'only';
    const hierarchy = await hierarchyWithMemberCounts(firmId);

    let services;
    if (firmId) {
      const rows = await listFirmServices(
        prisma,
        firmId,
        { includeArchived, archivedOnly },
        req.user!.id
      );
      services = rows.map(mapServiceRow);
    } else {
      services = SERVICE_CATALOG.map(enrichServiceForCatalog);
    }

    res.json({
      templates: Object.values(WORKFLOW_TEMPLATES).map((t) => ({
        id: t.id,
        domain: t.domain,
        name: t.name,
        steps: t.steps,
      })),
      services,
      hierarchy,
      meta: {
        appSurfaces: APP_SURFACE_LABELS,
        requirementCategories: CATEGORY_LABELS,
      },
    });
  } catch (err) {
    logger.error('Workflow catalog error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load workflow catalog' });
  }
});

/** GET /api/workflow/hierarchy */
router.get('/hierarchy', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hierarchy = await hierarchyWithMemberCounts(req.user!.firmId);
    res.json(hierarchy);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load hierarchy' });
  }
});

/** POST /api/workflow/services — add catalog service */
router.post(
  '/services',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const firmId = req.user!.firmId;
      if (!firmId) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }
      const body = serviceBodySchema.extend({ code: z.string().min(1).max(64) }).parse(req.body);
      const validated = validateFirmServiceInput({
        code: body.code,
        name: body.name,
        domain: body.domain,
        dueRule: body.dueRule,
        recurrence: body.recurrence,
        templateId: body.templateId as TemplateId,
        sortOrder: body.sortOrder,
      });
      if (!validated.ok) {
        res.status(400).json({ error: validated.error });
        return;
      }
      const result = await createFirmService({
        prisma,
        firmId,
        actorId: req.user!.id,
        input: validated.data,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json(mapServiceRow(result.service));
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Create firm service error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to create service' });
    }
  }
);

/** PUT /api/workflow/services/:code — edit catalog service */
router.put(
  '/services/:code',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const firmId = req.user!.firmId;
      if (!firmId) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }
      const body = serviceBodySchema.partial().parse(req.body);
      const result = await updateFirmService({
        prisma,
        firmId,
        actorId: req.user!.id,
        code: String(req.params.code),
        patch: {
          name: body.name,
          domain: body.domain,
          dueRule: body.dueRule,
          recurrence: body.recurrence,
          templateId: body.templateId as TemplateId | undefined,
          sortOrder: body.sortOrder,
        },
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(mapServiceRow(result.service));
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      logger.error('Update firm service error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to update service' });
    }
  }
);

/** POST /api/workflow/services/:code/archive */
router.post(
  '/services/:code/archive',
  authorize('Partner', 'Admin', 'Manager', 'HR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const firmId = req.user!.firmId;
      if (!firmId) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }
      const result = await archiveFirmService({
        prisma,
        firmId,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        code: String(req.params.code),
        ipAddress: req.ip,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error('Archive firm service error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to archive service' });
    }
  }
);

/** POST /api/workflow/services/:code/restore */
router.post(
  '/services/:code/restore',
  authorize('Partner', 'Admin', 'Manager', 'HR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const firmId = req.user!.firmId;
      if (!firmId) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }
      const result = await restoreFirmService({
        prisma,
        firmId,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        code: String(req.params.code),
        ipAddress: req.ip,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error('Restore firm service error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to restore service' });
    }
  }
);

/** GET /api/workflow/services/:code/data-request-template */
router.get(
  '/services/:code/data-request-template',
  authorize('Partner', 'Admin', 'Manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const firmId = req.user!.firmId;
      if (!firmId) {
        res.status(403).json({ error: 'Firm context required' });
        return;
      }
      const code = normalizeServiceCode(String(req.params.code));
      const svc = await getFirmServiceByCode(prisma, firmId, code, { includeArchived: true });
      if (!svc) {
        res.status(404).json({ error: 'Service not found' });
        return;
      }
      const tpl = await findOrCreateDataRequestTemplate(
        prisma,
        firmId,
        svc.code,
        svc.name,
        req.user!.id
      );
      res.json(tpl);
    } catch (err) {
      logger.error('Data request template lookup error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to load data request template' });
    }
  }
);

/** GET /api/workflow/services/:code — full requirement profile for one service */
router.get('/services/:code', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const code = normalizeServiceCode(String(req.params.code));
    const detail = serviceRequirementDetail(code);
    if (detail) {
      res.json(detail);
      return;
    }

    const firmId = req.user!.firmId;
    if (firmId) {
      const svc = await getFirmServiceByCode(prisma, firmId, code, { includeArchived: true });
      if (svc) {
        res.json({
          code: svc.code,
          domain: svc.domain,
          name: svc.name,
          summary: '',
          authority: '',
          applicability: '',
          firmWillAsk: [],
          requirements: [],
          checklistItems: [],
          internalTasks: [],
          byCategory: [],
          surfaces: [],
        });
        return;
      }
    }

    res.status(404).json({ error: 'Service not found in catalog' });
  } catch (err) {
    logger.error('Service detail error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load service requirements' });
  }
});

export default router;
