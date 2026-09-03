import fs from 'fs';
import path from 'path';
import { getEnv } from './env.js';
import logger from './logger.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

export function isReceiptImage(filePath: string, mimeType?: string | null): boolean {
  if (mimeType?.startsWith('image/')) return true;
  return IMAGE_EXT.has(path.extname(filePath).toLowerCase());
}

/** Extract text from receipt image via PaddleOCR sidecar. Returns null if disabled/unavailable. */
export async function extractTextViaPaddleOcr(filePath: string, mimeType?: string | null): Promise<string | null> {
  const baseUrl = getEnv().PADDLE_OCR_URL?.replace(/\/$/, '');
  if (!baseUrl || !isReceiptImage(filePath, mimeType)) return null;

  try {
    const buf = fs.readFileSync(filePath);
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mimeType ?? 'application/octet-stream' }), path.basename(filePath));

    const res = await fetch(`${baseUrl}/extract`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      logger.warn('PaddleOCR extract failed', { status: res.status, filePath });
      return null;
    }
    const data = (await res.json()) as { text?: string };
    return (data.text ?? '').trim() || null;
  } catch (err) {
    logger.warn('PaddleOCR unreachable', { error: (err as Error).message, filePath });
    return null;
  }
}

export async function isPaddleOcrReachable(): Promise<boolean> {
  const baseUrl = getEnv().PADDLE_OCR_URL?.replace(/\/$/, '');
  if (!baseUrl) return false;
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
