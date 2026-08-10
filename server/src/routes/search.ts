import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { queuePendingDocumentIndexing } from '../lib/documentIndexer.js';
import prisma from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { buildDocumentAccessWhere, getAccessibleEngagementIds } from '../lib/documentAccess.js';
import { searchDocuments as typesenseSearch } from '../lib/typesense.js';
import { getSearchServicesStatus } from '../lib/searchServices.js';
import { documentListSelect } from './documents.js';

const router = Router();
router.use(authenticate);

function buildMysqlSearchWhere(
  firmId: string,
  engagementIds: string[],
  userId: string,
  q: string
) {
  return {
    firmId,
    OR: [
      { visibility: 'FIRM' as const },
      ...(engagementIds.length > 0
        ? [{ engagementId: { in: engagementIds } }]
        : []),
      { uploadedById: userId },
    ],
    AND: [
      {
        OR: [
          { originalName: { contains: q } },
          { ocrText: { contains: q } },
          { category: { contains: q } },
          { folder: { contains: q } },
        ],
      },
    ],
  };
}

function mergeHits(
  tsHits: Awaited<ReturnType<typeof typesenseSearch>>,
  mysqlRows: Array<{ id: string; originalName: string; ocrText: string | null }>,
  q: string,
  limit: number
) {
  const highlights = new Map<string, string>();
  const orderedIds: string[] = [];

  for (const hit of tsHits) {
    if (!orderedIds.includes(hit.id)) orderedIds.push(hit.id);
    if (hit.highlight) highlights.set(hit.id, hit.highlight);
  }

  for (const d of mysqlRows) {
    if (!orderedIds.includes(d.id)) orderedIds.push(d.id);
    if (!highlights.has(d.id) && d.ocrText) {
      const idx = d.ocrText.toLowerCase().indexOf(q.toLowerCase());
      if (idx >= 0) {
        highlights.set(
          d.id,
          d.ocrText.slice(Math.max(0, idx - 40), idx + q.length + 40)
        );
      }
    }
  }

  return { orderedIds: orderedIds.slice(0, limit), highlights };
}

// GET /api/search/documents?q=...&engagementId=...&limit=20
router.get('/documents', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const engagementFilter = req.query.engagementId
      ? String(req.query.engagementId)
      : undefined;

    if (!q) {
      res.json({ results: [], documents: [], query: q, backend: 'none', services: null });
      return;
    }

    const user = req.user!;
    const firmId = user.firmId;
    if (!firmId) {
      res.json({ results: [], documents: [], query: q, backend: 'none', services: null });
      return;
    }

    let engagementIds = await getAccessibleEngagementIds(
      user.id,
      user.role,
      firmId
    );
    if (engagementFilter) {
      if (!engagementIds.includes(engagementFilter)) {
        res.status(403).json({ error: 'Access denied to this engagement' });
        return;
      }
      engagementIds = [engagementFilter];
    }

    const services = await getSearchServicesStatus();
    const mysqlWhere = buildMysqlSearchWhere(firmId, engagementIds, user.id, q);

    const [mysqlDocs, tsHits] = await Promise.all([
      prisma.document.findMany({
        where: mysqlWhere,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, originalName: true, ocrText: true },
      }),
      services.typesense === 'ok'
        ? typesenseSearch(firmId, q, { engagementIds, limit })
        : Promise.resolve([]),
    ]);

    const { orderedIds, highlights } = mergeHits(tsHits, mysqlDocs, q, limit);
    const accessWhere = await buildDocumentAccessWhere(user.id, user.role, firmId);

    const documents = orderedIds.length
      ? await prisma.document.findMany({
          where: {
            AND: [accessWhere, { id: { in: orderedIds } }],
          },
          select: documentListSelect,
        })
      : [];

    const docById = new Map(documents.map((d) => [d.id, d]));
    const orderedDocs = orderedIds
      .map((id) => docById.get(id))
      .filter((d): d is NonNullable<typeof d> => !!d);

    const usedMysql = mysqlDocs.length > 0;
    const usedTypesense = tsHits.length > 0;
    let backend: string = services.mode;
    if (usedMysql && !usedTypesense && services.typesense === 'ok') {
      backend = 'mysql'; // Typesense empty or timed out
    } else if (usedMysql && usedTypesense) {
      backend = 'hybrid';
    }

    const results = orderedDocs.map((d) => ({
      id: d.id,
      title: d.originalName,
      subtitle: [d.category, d.folder].filter(Boolean).join(' · ') || d.source,
      engagementId: d.engagementId,
      visibility: d.visibility,
      source: d.source,
      highlight: highlights.get(d.id),
      route: '/documents',
    }));

    res.json({
      query: q,
      backend,
      semantic: services.semantic === 'enabled',
      embeddingModel: services.embeddingModel,
      services,
      results,
      documents: orderedDocs,
    });
  } catch (err) {
    logger.error('Document search error', { error: (err as Error).message });
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/search/status — authenticated search stack diagnostics
router.get('/status', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const services = await getSearchServicesStatus();
  const firmId = req.user!.firmId ?? undefined;
  const pending = await prisma.document.count({
    where: {
      firmId,
      OR: [{ indexStatus: 'PENDING' }, { indexStatus: 'FAILED' }],
    },
  });
  const indexed = await prisma.document.count({
    where: { firmId, indexStatus: 'INDEXED' },
  });
  res.json({
    services,
    documents: { pending, indexed },
    ready: services.mode === 'hybrid' || services.mode === 'keyword' || services.mode === 'mysql',
  });
});

// POST /api/search/reindex — queue pending documents for Tika + Typesense (Partner/Admin)
router.post(
  '/reindex',
  authenticate,
  authorize('Partner', 'Admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const firmId = req.user!.firmId;
    if (!firmId) {
      res.status(403).json({ error: 'Firm context required' });
      return;
    }
    const queued = await queuePendingDocumentIndexing(500, firmId);
    res.json({ queued, message: 'Documents queued for indexing' });
  }
);

export default router;
