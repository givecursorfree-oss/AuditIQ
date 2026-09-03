/** Extract final paid total from receipt OCR text — seeks grand total / amount paid. */

const TOTAL_LABELS =
  /(?:grand\s*total|balance\s*due|total\s*due|amount\s*due|total\s*paid|amount\s*paid|net\s*payable|total\s*amount|bill\s*total|to\s*pay|payable|g\.?\s*total)/i;

/** Bare "total" on its own label line — exclude subtotal/tax/payment rows. */
const BARE_TOTAL_LABEL = /^(?:total|amount)\s*[:.]?\s*$/i;

const SKIP_LINE =
  /(?:visa|master\s*card|mastercard|amex|rupay|upi|debit|credit\s*card|card\s*#|xxxx|\*{4}|auth\s*#|approval|change\s*due|cash\s*tender|tip\b|sub\s*total|subtotal|\btax\b|\bvat\b|cgst|sgst|igst|qty\b|quantity)/i;

const CURRENCY = /(?:₹|rs\.?|inr|\$|usd)?\s*([\d,]+(?:\.\d{1,2})?)/gi;

function parseAmount(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function amountsOnLine(line: string): number[] {
  return [...line.matchAll(CURRENCY)]
    .map((m) => parseAmount(m[1]!))
    .filter((n): n is number => n != null);
}

function isTotalLabelLine(line: string): boolean {
  if (/sub\s*total|subtotal/i.test(line)) return false;
  return TOTAL_LABELS.test(line) || BARE_TOTAL_LABEL.test(line.trim());
}

/** Card last-4 and auth codes often OCR as bare 4-digit integers on payment lines. */
function looksLikeCardNoise(amount: number, line: string): boolean {
  if (!Number.isInteger(amount) || amount < 1000 || amount > 9999) return false;
  return /(?:visa|master|amex|card|debit|credit|auth|#\s*\d|\*{4}|xxxx)/i.test(line);
}

function pickBestAmount(amounts: number[], line: string): number | null {
  const filtered = amounts.filter((a) => !looksLikeCardNoise(a, line));
  if (filtered.length === 0) return null;
  return Math.max(...filtered);
}

/** ponytail: regex heuristic on OCR text; upgrade to ML if vendor-specific tuning needed. */
export function extractReceiptTotal(text: string): number | null {
  if (!text.trim()) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const labeled: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!isTotalLabelLine(line)) continue;

    const same = pickBestAmount(amountsOnLine(line), line);
    if (same != null) labeled.push(same);

    const next = lines[i + 1];
    if (next && !SKIP_LINE.test(next)) {
      const nextAmt = pickBestAmount(amountsOnLine(next), next);
      if (nextAmt != null) labeled.push(nextAmt);
    }
  }

  if (labeled.length > 0) return Math.max(...labeled);

  const fallback: number[] = [];
  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue;
    const amt = pickBestAmount(amountsOnLine(line), line);
    if (amt != null) fallback.push(amt);
  }

  if (fallback.length === 0) return null;

  const withCents = fallback.filter((a) => !Number.isInteger(a) || String(a).includes('.'));
  const pool = withCents.length > 0 ? withCents : fallback.filter((a) => a < 1000 || a % 100 !== 0);
  if (pool.length === 0) return Math.max(...fallback);
  return Math.max(...pool);
}
