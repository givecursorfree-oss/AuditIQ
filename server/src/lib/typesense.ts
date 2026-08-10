import { getEnv } from './env.js';
import logger from './logger.js';

/** Same multilingual ONNX model family as File Brain (Typesense built-in `ts/` namespace). */
export const DEFAULT_EMBEDDING_MODEL = 'ts/paraphrase-multilingual-mpnet-base-v2';

export interface TypesenseDocument {
  id: string;
  firm_id: string;
  engagement_id?: string;
  client_id?: string;
  original_name: string;
  folder?: string;
  category?: string;
  visibility: string;
  source: string;
  content: string;
  uploaded_by_name?: string;
  created_at: number;
}

export interface TypesenseCollectionSchema {
  name: string;
  fields: Array<Record<string, unknown>>;
  token_separators?: string[];
}

function collectionName(firmId: string): string {
  return `documents_${firmId.replace(/-/g, '_')}`;
}

/** Typesense filter values with hyphens (UUIDs) must be backtick-quoted. */
function tsFilterValue(value: string): string {
  return `\`${value}\``;
}

function baseUrl(): string {
  return getEnv().TYPESENSE_HOST.replace(/\/$/, '');
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-TYPESENSE-API-KEY': getEnv().TYPESENSE_API_KEY,
  };
}

export function getEmbeddingModelName(): string {
  const env = getEnv();
  if (!env.SEMANTIC_SEARCH_ENABLED) {
    return '';
  }
  return env.TYPESENSE_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

export function isSemanticSearchEnabled(): boolean {
  return getEmbeddingModelName().length > 0;
}

/** Collection schema with auto-embedding (semantic + keyword hybrid search). */
export function buildCollectionSchema(firmId: string): TypesenseCollectionSchema {
  const name = collectionName(firmId);
  const modelName = getEmbeddingModelName();

  const fields: Array<Record<string, unknown>> = [
    // Typesense reserves `id` — do not declare it in schema
    { name: 'firm_id', type: 'string', facet: true },
    { name: 'engagement_id', type: 'string', optional: true, facet: true },
    { name: 'client_id', type: 'string', optional: true, facet: true },
    { name: 'original_name', type: 'string' },
    { name: 'folder', type: 'string', optional: true, facet: true },
    { name: 'category', type: 'string', optional: true, facet: true },
    { name: 'visibility', type: 'string', facet: true },
    { name: 'source', type: 'string', facet: true },
    { name: 'content', type: 'string' },
    { name: 'uploaded_by_name', type: 'string', optional: true },
    { name: 'created_at', type: 'int64' },
  ];

  if (modelName) {
    fields.push({
      name: 'embedding',
      type: 'float[]',
      embed: {
        from: ['original_name', 'content', 'folder', 'category'],
        model_config: { model_name: modelName },
      },
    });
  }

  return {
    name,
    fields,
    token_separators: ['-', '_', '.', '/'],
  };
}

function schemaHasEmbeddingField(schema: { fields?: Array<{ name: string }> }): boolean {
  return Boolean(schema.fields?.some((f) => f.name === 'embedding'));
}

async function dropCollection(name: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/collections/${name}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok && res.status !== 404) {
    logger.warn('Typesense drop collection failed', { name, status: res.status });
  }
}

async function createCollection(schema: TypesenseCollectionSchema): Promise<boolean> {
  const res = await fetch(`${baseUrl()}/collections`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(schema),
  });
  if (!res.ok && res.status !== 409) {
    const body = await res.text();
    logger.warn('Typesense create collection failed', { status: res.status, body });
    return false;
  }
  return true;
}

/**
 * Ensure per-firm collection exists with semantic embedding field.
 * Drops and recreates legacy keyword-only collections.
 */
export async function ensureCollection(firmId: string): Promise<{ upgraded: boolean }> {
  const schema = buildCollectionSchema(firmId);
  const name = schema.name;
  const url = `${baseUrl()}/collections/${name}`;

  const check = await fetch(url, { headers: headers() });
  if (check.ok) {
    const existing = (await check.json()) as { fields?: Array<{ name: string }> };
    const needsSemantic = isSemanticSearchEnabled();
    const hasEmbedding = schemaHasEmbeddingField(existing);

    if (needsSemantic && !hasEmbedding) {
      logger.info('Upgrading Typesense collection to semantic search', { collection: name });
      await dropCollection(name);
      await createCollection(schema);
      return { upgraded: true };
    }
    if (!needsSemantic && hasEmbedding) {
      return { upgraded: false };
    }
    return { upgraded: false };
  }

  await createCollection(schema);
  return { upgraded: false };
}

/** Upgrade all firm collections after enabling semantic search (call on server startup). */
export async function migrateAllFirmCollections(
  firmIds: string[]
): Promise<string[]> {
  const upgraded: string[] = [];
  for (const firmId of firmIds) {
    try {
      const result = await ensureCollection(firmId);
      if (result.upgraded) upgraded.push(firmId);
    } catch (err) {
      logger.warn('Collection migration failed', { firmId, error: (err as Error).message });
    }
  }
  return upgraded;
}

export async function upsertDocument(
  firmId: string,
  doc: TypesenseDocument
): Promise<boolean> {
  try {
    await ensureCollection(firmId);
    const name = collectionName(firmId);
    const res = await fetch(`${baseUrl()}/collections/${name}/documents?action=upsert`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(doc),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn('Typesense upsert failed', { status: res.status, id: doc.id, body: body.slice(0, 200) });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('Typesense upsert error', { error: (err as Error).message });
    return false;
  }
}

export async function deleteDocument(firmId: string, documentId: string): Promise<void> {
  try {
    const name = collectionName(firmId);
    await fetch(`${baseUrl()}/collections/${name}/documents/${documentId}`, {
      method: 'DELETE',
      headers: headers(),
    });
  } catch {
    /* ignore */
  }
}

export interface SearchHit {
  id: string;
  original_name: string;
  folder?: string;
  category?: string;
  engagement_id?: string;
  visibility: string;
  source: string;
  highlight?: string;
  /** Present when hybrid/semantic search ranked the hit */
  semantic?: boolean;
}

function buildAccessFilter(firmId: string, engagementIds: string[]): string {
  const visibilityFilter = '(visibility:=FIRM';
  const engFilter =
    engagementIds.length > 0
      ? ` || engagement_id:[${engagementIds.map(tsFilterValue).join(',')}]`
      : '';
  return `firm_id:=${tsFilterValue(firmId)} && ${visibilityFilter}${engFilter})`;
}

function parseSearchHits(
  data: {
    hits?: Array<{
      document: TypesenseDocument;
      highlights?: Array<{ field: string; snippet?: string }>;
      vector_distance?: number;
      text_match?: number;
    }>;
  },
  semantic: boolean
): SearchHit[] {
  return (data.hits ?? []).map((h) => {
    const hl =
      h.highlights?.find((x) => x.field === 'content')?.snippet ||
      h.highlights?.find((x) => x.field === 'original_name')?.snippet;
    return {
      id: h.document.id,
      original_name: h.document.original_name,
      folder: h.document.folder,
      category: h.document.category,
      engagement_id: h.document.engagement_id,
      visibility: h.document.visibility,
      source: h.document.source,
      highlight: hl,
      semantic: semantic && (h.vector_distance !== undefined || !h.text_match),
    };
  });
}

async function runTypesenseQuery(
  name: string,
  params: URLSearchParams,
  timeoutMs: number
): Promise<{ ok: boolean; data?: { hits?: unknown[] }; status?: number; body?: string; timedOut?: boolean }> {
  try {
    const res = await fetch(
      `${baseUrl()}/collections/${name}/documents/search?${params}`,
      { headers: headers(), signal: AbortSignal.timeout(timeoutMs) }
    );
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, body };
    }
    const data = (await res.json()) as { hits?: unknown[] };
    return { ok: true, data };
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('abort') || msg.includes('timeout')) {
      return { ok: false, timedOut: true };
    }
    throw err;
  }
}

export async function searchDocuments(
  firmId: string,
  query: string,
  opts: {
    engagementIds: string[];
    limit?: number;
  }
): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const timeoutMs = getEnv().TYPESENSE_SEARCH_TIMEOUT_MS;
  const keywordTimeoutMs = Math.min(2500, timeoutMs);

  try {
    const name = collectionName(firmId);
    const limit = opts.limit ?? 20;
    const filterBy = buildAccessFilter(firmId, opts.engagementIds);
    const semantic = isSemanticSearchEnabled();

    const baseParams = new URLSearchParams({
      q,
      per_page: String(limit),
      filter_by: filterBy,
      highlight_full_fields: 'original_name,content',
      query_by: 'original_name,content,folder,category',
      prefix: 'true',
      num_typos: '2',
    });

    if (semantic) {
      const hybridParams = new URLSearchParams(baseParams);
      hybridParams.set('exclude_fields', 'embedding');
      hybridParams.set('query_by', 'embedding,original_name,content,folder,category');
      hybridParams.set('query_by_weights', '0,4,3,1,1');
      hybridParams.set('drop_tokens_threshold', '0');
      const alpha = getEnv().SEMANTIC_SEARCH_ALPHA;
      const k = Math.min(Math.max(limit * 2, 15), 40);
      hybridParams.set(
        'vector_query',
        `embedding:([], k: ${k}, alpha: ${alpha}, distance_threshold: 1.0)`
      );

      const hybrid = await runTypesenseQuery(name, hybridParams, timeoutMs);
      if (hybrid.ok && hybrid.data) {
        return parseSearchHits(
          hybrid.data as Parameters<typeof parseSearchHits>[0],
          true
        );
      }
      if (hybrid.timedOut) {
        logger.warn('Typesense hybrid search timed out — retrying keyword-only', { timeoutMs });
      } else if (!hybrid.ok) {
        logger.warn('Typesense hybrid search failed', {
          status: hybrid.status,
          body: hybrid.body?.slice(0, 200),
        });
      }
    }

    const keyword = await runTypesenseQuery(name, baseParams, keywordTimeoutMs);
    if (keyword.ok && keyword.data) {
      return parseSearchHits(
        keyword.data as Parameters<typeof parseSearchHits>[0],
        false
      );
    }
    if (keyword.timedOut) {
      logger.warn('Typesense keyword search timed out — MySQL fallback only', {
        keywordTimeoutMs,
      });
    } else if (!keyword.ok && keyword.status !== 404) {
      logger.warn('Typesense keyword search failed', {
        status: keyword.status,
        body: keyword.body?.slice(0, 200),
      });
    }
    return [];
  } catch (err) {
    logger.warn('Typesense search error', { error: (err as Error).message });
    return [];
  }
}

export function isTypesenseConfigured(): boolean {
  return !!getEnv().TYPESENSE_HOST && !!getEnv().TYPESENSE_API_KEY;
}
