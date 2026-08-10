import fs from 'fs';
import prisma from './prisma.js';
import logger from './logger.js';
import { extractTextFromFile } from './tika.js';
import { upsertDocument, deleteDocument } from './typesense.js';

const indexingQueue = new Set<string>();
let processing = false;

export function enqueueDocumentIndex(documentId: string): void {
  indexingQueue.add(documentId);
  void drainIndexQueue();
}

async function drainIndexQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (indexingQueue.size > 0) {
    const id = indexingQueue.values().next().value as string;
    indexingQueue.delete(id);
    try {
      await indexDocument(id);
    } catch (err) {
      logger.error('Document index failed', { documentId: id, error: (err as Error).message });
    }
  }

  processing = false;
}

export async function indexDocument(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      uploadedBy: { select: { firstName: true, lastName: true } },
      engagement: { select: { clientId: true } },
    },
  });

  if (!doc || !doc.firmId) {
    await prisma.document.update({
      where: { id: documentId },
      data: { indexStatus: 'SKIPPED' },
    }).catch(() => undefined);
    return;
  }

  if (!doc.storagePath || !fs.existsSync(doc.storagePath)) {
    await prisma.document.update({
      where: { id: documentId },
      data: { indexStatus: 'FAILED' },
    });
    return;
  }

  let text = doc.ocrText || '';
  if (!text || !doc.isOcrProcessed) {
    text = await extractTextFromFile(doc.storagePath, doc.mimeType);
  }

  const uploadedByName = doc.uploadedBy
    ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`
    : undefined;

  const searchableText = text.trim() || doc.originalName;

  const indexed = await upsertDocument(doc.firmId, {
    id: doc.id,
    firm_id: doc.firmId,
    engagement_id: doc.engagementId ?? undefined,
    client_id: doc.clientId ?? doc.engagement?.clientId ?? undefined,
    original_name: doc.originalName,
    folder: doc.folder,
    category: doc.category ?? undefined,
    visibility: doc.visibility,
    source: doc.source,
    content: searchableText,
    uploaded_by_name: uploadedByName,
    created_at: Math.floor(doc.createdAt.getTime() / 1000),
  });

  await prisma.document.update({
    where: { id: documentId },
    data: {
      ocrText: text.slice(0, 500_000),
      isOcrProcessed: true,
      // MySQL ocrText powers search when Typesense is down; do not mark FAILED if only Typesense failed.
      indexStatus: searchableText.length > 0 ? 'INDEXED' : 'FAILED',
      indexedAt: new Date(),
    },
  });

  if (!indexed && searchableText.length > 0) {
    logger.info('Document text indexed in database; Typesense unavailable', { documentId });
  }
}

export async function removeDocumentFromIndex(
  firmId: string | null,
  documentId: string
): Promise<void> {
  if (firmId) {
    await deleteDocument(firmId, documentId);
  }
}

/** Queue documents that need text extraction / search indexing (startup + after deploy). */
export async function queuePendingDocumentIndexing(
  limit = 500,
  firmId?: string
): Promise<number> {
  const docs = await prisma.document.findMany({
    where: {
      ...(firmId ? { firmId } : { firmId: { not: null } }),
      OR: [
        { indexStatus: 'PENDING' },
        { indexStatus: 'FAILED' },
        { isOcrProcessed: false },
        { ocrText: null },
        { ocrText: '' },
      ],
    },
    select: { id: true },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
  for (const d of docs) {
    enqueueDocumentIndex(d.id);
  }
  if (docs.length > 0) {
    logger.info(`Queued ${docs.length} document(s) for search indexing`);
  }
  return docs.length;
}

/** Re-index all documents for a firm (admin / post-migration). */
export async function reindexFirmDocuments(firmId: string): Promise<number> {
  const docs = await prisma.document.findMany({
    where: { firmId },
    select: { id: true },
  });
  for (const d of docs) {
    enqueueDocumentIndex(d.id);
  }
  return docs.length;
}
