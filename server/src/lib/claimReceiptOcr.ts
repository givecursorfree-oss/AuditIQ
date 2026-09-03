import prisma from './prisma.js';
import { extractReceiptTotal } from './receiptTotalExtractor.js';
import { extractReceiptText } from './receiptOcrExtract.js';
import { logClaimAudit } from './claimAudit.js';
import logger from './logger.js';

/** Run OCR on all receipts for a claim; store highest detected total (manager-only). */
export async function runClaimReceiptOcr(claimId: string): Promise<void> {
  try {
    const claim = await prisma.expenseClaim.findUnique({
      where: { id: claimId },
      include: { receipts: true },
    });
    if (!claim || claim.receipts.length === 0) return;

    let best: number | null = null;
    let primarySource: string | null = null;

    for (const receipt of claim.receipts) {
      const { text, source } = await extractReceiptText(receipt.storagePath, receipt.mimeType);
      if (!primarySource && source !== 'none') primarySource = source;
      const total = extractReceiptTotal(text);
      if (total != null && (best == null || total > best)) best = total;
    }

    await prisma.expenseClaim.update({
      where: { id: claimId },
      data: {
        ocrDetectedAmount: best ?? undefined,
        ocrStatus: best != null ? 'completed' : 'failed',
      },
    });
    await logClaimAudit(claimId, 'ocr_completed', null, {
      ocrDetectedAmount: best,
      ocrEngine: primarySource ?? 'none',
    });
  } catch (err) {
    logger.warn('Claim OCR failed', { claimId, error: (err as Error).message });
    await prisma.expenseClaim
      .update({ where: { id: claimId }, data: { ocrStatus: 'failed' } })
      .catch(() => {});
  }
}

/** ponytail: fire-and-forget async OCR after upload. */
export function queueClaimReceiptOcr(claimId: string): void {
  void runClaimReceiptOcr(claimId);
}
