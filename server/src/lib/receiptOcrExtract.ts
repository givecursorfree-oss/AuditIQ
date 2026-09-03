import { extractTextFromFile } from './tika.js';
import { extractTextViaPaddleOcr, isReceiptImage } from './paddleOcr.js';

export type ReceiptOcrSource = 'paddle' | 'tika' | 'none';

/** PaddleOCR for images, Tika fallback (PDF + images). */
export async function extractReceiptText(
  filePath: string,
  mimeType?: string | null
): Promise<{ text: string; source: ReceiptOcrSource }> {
  if (isReceiptImage(filePath, mimeType)) {
    const paddleText = await extractTextViaPaddleOcr(filePath, mimeType);
    if (paddleText) return { text: paddleText, source: 'paddle' };
  }

  const tikaText = await extractTextFromFile(filePath, mimeType ?? 'application/octet-stream');
  if (tikaText.trim()) return { text: tikaText, source: 'tika' };

  return { text: '', source: 'none' };
}
