/**
 * Extract final receipt amount for claims OCR.
 * Priority: To Pay / Amount Paid → Grand Total / Bill Total → bare Total.
 * Never: MRP, subtotal, discount, tax, calendar years.
 */

/** Highest — what was / is actually paid after discounts. */
const PAID_LABELS =
  /(?:amount\s*paid|total\s*paid|you\s*paid|paid\s*amount|customer\s*paid|cash\s*paid|card\s*paid|upi\s*paid|to\s*pay|amount\s*to\s*pay|please\s*pay|pay\s*now|net\s*payable|net\s*amount|net\s*total|balance\s*due|amount\s*due|total\s*due|payable\s*amount|amount\s*payable|total\s*payable|pay\s*amount|settlement\s*amount|closing\s*amount|amount\s*receivable)/i;

/**
 * Mid — bill totals (Grand Total and common synonyms).
 * Used when no paid / to-pay line exists; paid labels still win when both exist.
 */
const GRAND_LABELS =
  /(?:grand\s*tot(?:al|als|ol|ai)?|bill\s*tot(?:al|als)?|g\.?\s*tot(?:al)?|gtotal|total\s*amount|final\s*tot(?:al)?|invoice\s*tot(?:al)?|order\s*tot(?:al)?|receipt\s*tot(?:al)?|overall\s*tot(?:al)?|bill\s*amount|total\s*bill|amount\s*of\s*(?:the\s*)?bill|check\s*tot(?:al)?|cheque\s*tot(?:al)?|sales\s*tot(?:al)?|net\s*bill)/i;

/** Bare "total" / "amount" on its own label line. */
const BARE_TOTAL_LABEL = /^(?:total|amount)\s*[:.]?\s*$/i;

/** Never treat these as the paid / grand total. */
const SKIP_LINE =
  /(?:visa|master\s*card|mastercard|amex|rupay|upi\b(?!\s*paid)|debit|credit\s*card|card\s*#|xxxx|\*{4}|auth\s*#|approval|change\s*due|cash\s*tender|tip\b|sub\s*total|subtotal|item\s*total|items?\s*total|\btax\b|\bvat\b|cgst|sgst|igst|qty\b|quantity|\bmrp\b|list\s*price|before\s*discount|gross\s*total|gross\s*amount|\bdiscount\b|\bsave\b|%\s*off|was\s*₹|strike|round\s*off)/i;

const CURRENCY = /(?:₹|rs\.?|inr|\$|usd)?\s*([\d,]+(?:\.\d{1,2})?)/gi;

type Priority = 3 | 2 | 1;

function parseAmount(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Calendar / FY years must never become claim totals (e.g. OCR "2026"). */
export function isLikelyYearAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 1900 && amount <= 2100;
}

function amountsOnLine(line: string): number[] {
  return [...line.matchAll(CURRENCY)]
    .map((m) => parseAmount(m[1]!))
    .filter((n): n is number => n != null && !isLikelyYearAmount(n));
}

/** Card last-4 and auth codes often OCR as bare 4-digit integers on payment lines. */
function looksLikeCardNoise(amount: number, line: string): boolean {
  if (!Number.isInteger(amount) || amount < 1000 || amount > 9999) return false;
  return /(?:visa|master|amex|card|debit|credit|auth|#\s*\d|\*{4}|xxxx)/i.test(line);
}

function pickBestAmount(amounts: number[], line: string): number | null {
  const filtered = amounts.filter((a) => !looksLikeCardNoise(a, line) && !isLikelyYearAmount(a));
  if (filtered.length === 0) return null;
  // Same line often has label + amount; take the last currency figure (rightmost).
  return filtered[filtered.length - 1]!;
}

function labelPriority(line: string): Priority | null {
  if (SKIP_LINE.test(line) && !PAID_LABELS.test(line) && !GRAND_LABELS.test(line)) return null;
  if (/sub\s*total|subtotal/i.test(line)) return null;
  if (PAID_LABELS.test(line)) return 3;
  if (GRAND_LABELS.test(line)) return 2;
  if (BARE_TOTAL_LABEL.test(line.trim()) || /(?:^|\s)total\s*[:.]?\s*₹?/i.test(line)) {
    if (/sub\s*total|subtotal|item\s*total|items?\s*total/i.test(line)) return null;
    return 1;
  }
  return null;
}

type Hit = { amount: number; priority: Priority; index: number };

function collectLabeledHits(lines: string[]): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const priority = labelPriority(line);
    if (priority == null) continue;

    const same = pickBestAmount(amountsOnLine(line), line);
    if (same != null) hits.push({ amount: same, priority, index: i });

    const next = lines[i + 1];
    if (next && !SKIP_LINE.test(next) && labelPriority(next) == null) {
      const nextAmt = pickBestAmount(amountsOnLine(next), next);
      if (nextAmt != null) hits.push({ amount: nextAmt, priority, index: i });
    }
  }
  return hits;
}

/**
 * Prefer last (bottom-of-receipt) amount among the highest priority tier.
 * Paid / to-pay beats Grand Total; Grand Total beats bare "total".
 */
function pickFromHits(hits: Hit[]): number | null {
  if (hits.length === 0) return null;
  const bestPri = Math.max(...hits.map((h) => h.priority)) as Priority;
  const tier = hits.filter((h) => h.priority === bestPri);
  return tier[tier.length - 1]!.amount;
}

/** Text with no paid/grand cues — avoid inventing totals from calendars / FY docs. */
function looksLikeNonReceiptDocument(text: string): boolean {
  const lower = text.toLowerCase();
  const hasPaidCue =
    PAID_LABELS.test(text) || GRAND_LABELS.test(text) || /\btotal\b/i.test(text);
  if (hasPaidCue) return false;
  const calendarHints =
    (lower.match(/\b(mon|tue|wed|thu|fri|sat|sun)\b/g) ?? []).length >= 4 ||
    /compliance\s*calendar|chartered\s*accountants|gstr\s*\d|financial\s*year|fy\s*\d{4}/i.test(
      text
    );
  return calendarHints;
}

/** ponytail: regex heuristic on OCR text; upgrade to ML if vendor-specific tuning needed. */
export function extractReceiptTotal(text: string): number | null {
  if (!text.trim()) return null;
  if (looksLikeNonReceiptDocument(text)) return null;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const labeled = pickFromHits(collectLabeledHits(lines));
  if (labeled != null) return labeled;

  const fallback: number[] = [];
  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue;
    const amt = pickBestAmount(amountsOnLine(line), line);
    if (amt != null) fallback.push(amt);
  }

  if (fallback.length === 0) return null;

  const withCents = fallback.filter((a) => !Number.isInteger(a));
  const pool =
    withCents.length > 0 ? withCents : fallback.filter((a) => a < 1000 || a % 100 !== 0);
  if (pool.length === 0) return Math.max(...fallback);
  return Math.max(...pool);
}
