import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  WORKFLOW_TEMPLATES,
  SERVICE_CATALOG,
  MKD_HIERARCHY,
} from '../lib/workflowCatalog.js';
import {
  enrichServiceForCatalog,
  serviceRequirementDetail,
  normalizeServiceCode,
  APP_SURFACE_LABELS,
  CATEGORY_LABELS,
} from '../lib/serviceRequirements.js';
import prisma from '../lib/prisma.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

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

router.get('/catalog', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hierarchy = await hierarchyWithMemberCounts(req.user!.firmId);
    res.json({
      templates: Object.values(WORKFLOW_TEMPLATES).map((t) => ({
        id: t.id,
        domain: t.domain,
        name: t.name,
        steps: t.steps,
      })),
      services: SERVICE_CATALOG.map(enrichServiceForCatalog),
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

/** GET /api/workflow/services/:code — full requirement profile for one service */
router.get('/services/:code', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const code = normalizeServiceCode(String(req.params.code));
    const detail = serviceRequirementDetail(code);
    if (!detail) {
      res.status(404).json({ error: 'Service not found in MKD catalog' });
      return;
    }
    res.json(detail);
  } catch (err) {
    logger.error('Service detail error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to load service requirements' });
  }
});

export default router;
