import fs from 'fs';
import { getEnv } from './env.js';
import logger from './logger.js';

const MAX_EXTRACT_CHARS = 500_000;

/**
 * Extract plain text from a file using Apache Tika (HTTP).
 * Falls back to reading .txt/.csv directly when Tika is unavailable.
 */
export async function extractTextFromFile(
  filePath: string,
  mimeType: string
): Promise<string> {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  if (['txt', 'csv', 'md', 'json', 'xml', 'html'].includes(ext)) {
    try {
      return fs.readFileSync(filePath, 'utf8').slice(0, MAX_EXTRACT_CHARS);
    } catch {
      return '';
    }
  }

  const tikaUrl = getEnv().TIKA_URL.replace(/\/$/, '');

  try {
    const buf = fs.readFileSync(filePath);
    const res = await fetch(`${tikaUrl}/tika`, {
      method: 'PUT',
      headers: {
        Accept: 'text/plain',
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: buf,
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      logger.warn('Tika extraction failed', { status: res.status, filePath });
      return await fallbackPdfExtract(filePath, ext);
    }

    const text = await res.text();
    return text.slice(0, MAX_EXTRACT_CHARS);
  } catch (err) {
    logger.warn('Tika unreachable, using fallback', { error: (err as Error).message });
    return await fallbackPdfExtract(filePath, ext);
  }
}

async function fallbackPdfExtract(filePath: string, ext: string): Promise<string> {
  if (ext !== 'pdf') return '';
  try {
    const { createRequire } = await import('module');
    const require = createRequire(__filename);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text?: string }>;
    const buf = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    return (data.text || '').slice(0, MAX_EXTRACT_CHARS);
  } catch {
    return '';
  }
}
