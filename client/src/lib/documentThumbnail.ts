import api from '../services/api';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const PREVIEW_EXTS = new Set([...IMAGE_EXTS, 'pdf']);

const thumbCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

let activeLoads = 0;
const MAX_CONCURRENT = 3;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeLoads < MAX_CONCURRENT) {
    activeLoads += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitQueue.push(resolve));
}

function releaseSlot(): void {
  activeLoads -= 1;
  const next = waitQueue.shift();
  if (next) {
    activeLoads += 1;
    next();
  }
}

export function canShowThumbnail(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return PREVIEW_EXTS.has(ext);
}

export function getCachedThumbnail(documentId: string): string | undefined {
  return thumbCache.get(documentId);
}

async function fetchDocumentBlob(documentId: string): Promise<Blob> {
  const { data } = await api.get(`/documents/${documentId}/download`, {
    responseType: 'blob',
    timeout: 30000,
  });
  return data as Blob;
}

async function renderPdfThumbnail(blob: Blob): Promise<string> {
  const data = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const baseScale = 0.35;
  const viewport = page.getViewport({ scale: baseScale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.72);
}

async function renderImageThumbnail(blob: Blob, ext: string): Promise<string> {
  const mime =
    ext === 'png'
        ? 'image/png'
        : ext === 'gif'
          ? 'image/gif'
          : ext === 'webp'
            ? 'image/webp'
            : 'image/jpeg';
  const url = URL.createObjectURL(new Blob([blob], { type: mime }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image load failed'));
      el.src = url;
    });
    const maxW = 280;
    const maxH = 200;
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const w = Math.max(1, Math.floor(img.naturalWidth * scale));
    const h = Math.max(1, Math.floor(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadDocumentThumbnail(
  documentId: string,
  fileName: string
): Promise<string | null> {
  const cached = thumbCache.get(documentId);
  if (cached) return cached;

  const existing = inflight.get(documentId);
  if (existing) return existing;

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (!PREVIEW_EXTS.has(ext)) return null;

  const task = (async () => {
    await acquireSlot();
    try {
      const blob = await fetchDocumentBlob(documentId);
      let dataUrl: string;
      if (ext === 'pdf') {
        dataUrl = await renderPdfThumbnail(blob);
      } else {
        dataUrl = await renderImageThumbnail(blob, ext);
      }
      thumbCache.set(documentId, dataUrl);
      return dataUrl;
    } catch {
      return null;
    } finally {
      releaseSlot();
      inflight.delete(documentId);
    }
  })();

  inflight.set(documentId, task);
  return task;
}
