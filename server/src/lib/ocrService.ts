import { execFile } from 'child_process';
import { promisify } from 'util';
import logger from './logger.js';

const execFileAsync = promisify(execFile);

/**
 * One-click OCR for scanned/image PDFs via the `ocrmypdf` CLI (--force-ocr).
 * See https://github.com/ocrmypdf/ocrmypdf — this is a system binary, NOT an
 * npm package, so we shell out to it and degrade gracefully when it is absent.
 *
 * ponytail: assumes `ocrmypdf` is on PATH; no language-pack selection or
 * per-page image detection — upgrade to `--skip-text` heuristics if re-OCR cost
 * becomes a problem on large already-text PDFs.
 */
let _available: boolean | undefined;

export async function isOcrAvailable(): Promise<boolean> {
  if (_available !== undefined) return _available;
  try {
    await execFileAsync('ocrmypdf', ['--version'], { timeout: 10000 });
    _available = true;
  } catch {
    _available = false;
  }
  return _available;
}

export type OcrResult = { ok: true } | { ok: false; reason: 'unavailable' | 'failed'; message: string };

/**
 * Runs `ocrmypdf --force-ocr <input> <output>`. Writing in place is supported by
 * ocrmypdf, so input and output may be the same path.
 */
export async function ocrPdf(inputPath: string, outputPath: string): Promise<OcrResult> {
  if (!(await isOcrAvailable())) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'ocrmypdf is not installed on the server. Install it from https://github.com/ocrmypdf/ocrmypdf',
    };
  }
  try {
    await execFileAsync('ocrmypdf', ['--force-ocr', inputPath, outputPath], {
      timeout: 5 * 60 * 1000,
      maxBuffer: 1024 * 1024 * 32,
    });
    return { ok: true };
  } catch (err) {
    const message = (err as Error).message;
    logger.error('ocrmypdf failed', { error: message });
    return { ok: false, reason: 'failed', message };
  }
}
