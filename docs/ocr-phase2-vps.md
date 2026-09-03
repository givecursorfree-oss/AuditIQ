# Receipt OCR — Phase 2 options for VPS

**Status:** Deferred to Phase 2 per `.cursor/rules/claims-expense-phases.mdc`. Do not implement until V1 claims flow is stable.

## Requirement (from spec)

- Employee enters amount manually; **never sees OCR result**
- OCR runs after receipt upload in background
- Manager sees: `Claimed: ₹520` vs `OCR detected: ₹518`
- OCR is **advisory only** — never overwrites claimant amount
- Prefer **final total paid** on receipt, not line-item subtotals

## What you already have on VPS

| Service | In repo | Good for receipts? |
|---------|---------|-------------------|
| **Apache Tika** (`TIKA_URL`) | Yes — `server/src/lib/tika.ts` | Text extraction from PDF/images; no amount parsing |
| **ocrmypdf** | Yes — `server/src/lib/ocrService.ts` | PDF scan → searchable text; not ideal for phone photos |
| **pdf-parse** | Yes — server dependency | PDF text only |

Tika alone gives raw text; you still need a **total extractor** (regex/heuristic on “Grand Total”, “Amount Paid”, etc.).

## Recommended for self-hosted VPS (Phase 2)

### Option A — **Tika + heuristic parser** (lazy first step)

- **Pros:** No new container; already in docker-compose; low ops
- **Cons:** Weak on blurry photos; Hindi/mixed receipts; needs tuning per vendor
- **Best when:** Mostly clear PDFs and standard restaurant bills

### Option B — **PaddleOCR / EasyOCR sidecar** (best accuracy on VPS)

- Run a small Python FastAPI service with PaddleOCR (CPU mode)
- Node worker POSTs receipt image → returns text blocks → same heuristic total parser
- **Pros:** Strong on phone photos; self-hosted; no per-receipt API cost
- **Cons:** Extra container (~1–2 GB RAM); Python ops; model updates

**Recommendation for MKD-style mixed receipts:** **Option B (PaddleOCR)** for production accuracy; **Option A** only as a quick spike.

### Option C — **Cloud OCR** (Google Vision / AWS Textract)

- **Pros:** Highest accuracy, minimal VPS CPU
- **Cons:** Per-image cost; data leaves VPS; compliance review for client receipts
- **Not recommended** unless firm explicitly accepts cloud processing

## Suggested Phase 2 architecture

```text
Receipt upload (existing ExpenseClaimReceipt)
    → queue job (scheduler or inline async)
    → OCR service (PaddleOCR or Tika)
    → totalExtractor.ts (regex + largest currency near "total"/"grand")
    → store ocrDetectedAmount on claim (manager-only field)
    → ClaimAuditEvent: ocr_completed
```

## Additional Phase 2 validation (same sprint as OCR)

Cross-check food claims with:

- `LateHoursClaim.actualEndTime` or attendance/time entry logoff
- `fingerprintLogoffTime` from `biometricService.ts`

Surface flags in `policyFlags` for manager only — **do not block submit**.

## Decision summary

| Priority | Choice |
|----------|--------|
| **Now (V1)** | No OCR |
| **Phase 2 default** | PaddleOCR sidecar + shared total parser |
| **Phase 2 fallback** | Tika + heuristics if ops want zero new services |
| **Avoid for CA firm VPS** | Cloud OCR unless approved |
