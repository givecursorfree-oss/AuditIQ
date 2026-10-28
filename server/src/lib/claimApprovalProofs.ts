import fs from 'fs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/** One receipt file from a batched claim (image or PDF). */
export type ClaimProofSource = {
  claimantName: string;
  dateLabel: string;
  amount: number;
  filePath: string;
  mimeType?: string | null;
  fileName: string;
};

type ProofCell = {
  claimantName: string;
  dateLabel: string;
  amount: number;
  pageNum: number;
  totalPages: number;
  countInPageTotal: boolean;
  kind: 'image' | 'pdf';
  bytes: Uint8Array;
  mimeHint: string;
  pdfPageIndex?: number;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M_LEFT = 20;
const M_RIGHT = 20;
const M_TOP = 20;
const M_BOTTOM = 22;
const HDR_H = 22;
const FTR_H = 16;
const GAP_X = 12;
const GAP_Y = 12;
const GRID_W = PAGE_W - M_LEFT - M_RIGHT;
const GRID_H = PAGE_H - M_TOP - M_BOTTOM - HDR_H - FTR_H;
const CELL_W = (GRID_W - GAP_X) / 2;
const CELL_H = (GRID_H - GAP_Y) / 2;

const CELLS: Array<[number, number]> = [
  [M_LEFT, M_BOTTOM + FTR_H + CELL_H + GAP_Y],
  [M_LEFT + CELL_W + GAP_X, M_BOTTOM + FTR_H + CELL_H + GAP_Y],
  [M_LEFT, M_BOTTOM + FTR_H],
  [M_LEFT + CELL_W + GAP_X, M_BOTTOM + FTR_H],
];

function fmtAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function cellLabel(c: ProofCell): string {
  const pageSuffix = c.totalPages > 1 ? ` (${c.pageNum}/${c.totalPages})` : '';
  // StandardFonts are WinAnsi — no ₹ glyph
  return `${c.claimantName} - ${c.dateLabel} - Rs.${fmtAmount(c.amount)}${pageSuffix}`;
}

function isPdf(source: ClaimProofSource): boolean {
  const mime = (source.mimeType || '').toLowerCase();
  const name = source.fileName.toLowerCase();
  return mime.includes('pdf') || name.endsWith('.pdf');
}

function isPng(source: ClaimProofSource, bytes: Uint8Array): boolean {
  const mime = (source.mimeType || '').toLowerCase();
  const name = source.fileName.toLowerCase();
  if (mime.includes('png') || name.endsWith('.png')) return true;
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50;
}

async function expandSources(sources: ClaimProofSource[]): Promise<ProofCell[]> {
  const cells: ProofCell[] = [];
  for (const src of sources) {
    if (!fs.existsSync(src.filePath)) continue;
    const bytes = new Uint8Array(fs.readFileSync(src.filePath));
    if (isPdf(src)) {
      try {
        const donor = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const n = donor.getPageCount();
        for (let i = 0; i < n; i++) {
          cells.push({
            claimantName: src.claimantName,
            dateLabel: src.dateLabel,
            amount: src.amount,
            pageNum: i + 1,
            totalPages: n,
            countInPageTotal: i === 0,
            kind: 'pdf',
            bytes,
            mimeHint: 'application/pdf',
            pdfPageIndex: i,
          });
        }
      } catch {
        /* skip unreadable PDF */
      }
      continue;
    }
    cells.push({
      claimantName: src.claimantName,
      dateLabel: src.dateLabel,
      amount: src.amount,
      pageNum: 1,
      totalPages: 1,
      countInPageTotal: true,
      kind: 'image',
      bytes,
      mimeHint: isPng(src, bytes) ? 'image/png' : 'image/jpeg',
    });
  }
  return cells;
}

async function drawProofInBox(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument['addPage']>,
  cell: ProofCell,
  box: { x: number; y: number; w: number; h: number }
): Promise<void> {
  try {
    if (cell.kind === 'pdf') {
      const [embedded] = await pdfDoc.embedPdf(cell.bytes, [cell.pdfPageIndex ?? 0]);
      const ew = embedded.width;
      const eh = embedded.height;
      const scale = Math.min(box.w / ew, box.h / eh);
      const rw = ew * scale;
      const rh = eh * scale;
      page.drawPage(embedded, {
        x: box.x + (box.w - rw) / 2,
        y: box.y + (box.h - rh) / 2,
        width: rw,
        height: rh,
      });
      return;
    }
    const img =
      cell.mimeHint === 'image/png' ? await pdfDoc.embedPng(cell.bytes) : await pdfDoc.embedJpg(cell.bytes);
    const scale = Math.min(box.w / img.width, box.h / img.height);
    const rw = img.width * scale;
    const rh = img.height * scale;
    page.drawImage(img, {
      x: box.x + (box.w - rw) / 2,
      y: box.y + (box.h - rh) / 2,
      width: rw,
      height: rh,
    });
  } catch {
    page.drawText('Proof unavailable', {
      x: box.x + 8,
      y: box.y + box.h / 2,
      size: 8,
      color: rgb(0.7, 0.1, 0.1),
    });
  }
}

/**
 * Page 1 = existing approval cover. Pages 2+ = 2×2 late-sitting proof collage
 * (same layout as collate_single_day_package.py).
 */
export async function mergeApprovalCoverWithProofs(
  coverPdfPath: string,
  sources: ClaimProofSource[],
  outputPath: string
): Promise<string> {
  const coverBytes = fs.readFileSync(coverPdfPath);
  const out = await PDFDocument.create();
  const cover = await PDFDocument.load(coverBytes);
  const coverPages = await out.copyPages(cover, cover.getPageIndices());
  for (const p of coverPages) out.addPage(p);

  const cells = await expandSources(sources);
  if (cells.length === 0) {
    const saved = await out.save();
    fs.writeFileSync(outputPath, saved);
    return outputPath;
  }

  const font = await out.embedFont(StandardFonts.Helvetica);
  const fontBold = await out.embedFont(StandardFonts.HelveticaBold);
  const pagesCount = Math.ceil(cells.length / 4);

  for (let pIdx = 0; pIdx < pagesCount; pIdx++) {
    const chunk = cells.slice(pIdx * 4, pIdx * 4 + 4);
    const page = out.addPage([PAGE_W, PAGE_H]);

    page.drawText('Late Sitting Reimbursement Proofs', {
      x: M_LEFT,
      y: PAGE_H - M_TOP - 14,
      size: 14,
      font: fontBold,
      color: rgb(0.1, 0.13, 0.17),
    });
    page.drawLine({
      start: { x: M_LEFT, y: PAGE_H - M_TOP - HDR_H + 2 },
      end: { x: PAGE_W - M_RIGHT, y: PAGE_H - M_TOP - HDR_H + 2 },
      thickness: 0.8,
      color: rgb(0.8, 0.84, 0.88),
    });

    let pageTotal = 0;
    for (let slot = 0; slot < chunk.length; slot++) {
      const item = chunk[slot]!;
      const [cx, cy] = CELLS[slot]!;
      if (item.countInPageTotal) pageTotal += item.amount;

      page.drawRectangle({
        x: cx,
        y: cy,
        width: CELL_W,
        height: CELL_H,
        borderColor: rgb(0.89, 0.91, 0.94),
        borderWidth: 0.8,
      });

      const pillH = 18;
      const pillY = cy + CELL_H - pillH - 4;
      const pillX = cx + 4;
      const pillW = CELL_W - 8;
      page.drawRectangle({
        x: pillX,
        y: pillY,
        width: pillW,
        height: pillH,
        color: rgb(0.95, 0.96, 0.97),
        borderColor: rgb(0.8, 0.84, 0.88),
        borderWidth: 0.6,
      });

      const label = cellLabel(item);
      const labelSize = 8;
      const textW = fontBold.widthOfTextAtSize(label, labelSize);
      page.drawText(label, {
        x: pillX + Math.max(2, (pillW - textW) / 2),
        y: pillY + (pillH - labelSize) / 2 + 1,
        size: labelSize,
        font: fontBold,
        color: rgb(0.12, 0.16, 0.23),
        maxWidth: pillW - 4,
      });

      const imgBox = {
        x: cx + 4,
        y: cy + 4,
        w: CELL_W - 8,
        h: pillY - cy - 8,
      };
      await drawProofInBox(out, page, item, imgBox);
    }

    page.drawText(`Proofs Page ${pIdx + 1} of ${pagesCount}`, {
      x: M_LEFT,
      y: M_BOTTOM,
      size: 9,
      font,
      color: rgb(0.28, 0.33, 0.41),
    });
    const tot = `Total on page: Rs.${fmtAmount(pageTotal)}`;
    page.drawText(tot, {
      x: PAGE_W - M_RIGHT - fontBold.widthOfTextAtSize(tot, 9),
      y: M_BOTTOM,
      size: 9,
      font: fontBold,
      color: rgb(0.12, 0.16, 0.23),
    });
  }

  const saved = await out.save();
  fs.writeFileSync(outputPath, saved);
  return outputPath;
}
