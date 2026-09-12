import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

export type ClaimExportPaidBy = { name: string; amount: number };
export type ClaimExportAttendee = { name: string; work: string };

export type ClaimExportData = {
  title?: string;
  date_str: string;
  manager_name: string;
  client_name: string;
  submission_date: string;
  paid_by: ClaimExportPaidBy[];
  attendees: ClaimExportAttendee[];
};

function formatDdMmYyyy(d = new Date()): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function nameOf(u?: { firstName: string; lastName: string } | null): string {
  if (!u) return '';
  return `${u.firstName} ${u.lastName}`.trim();
}

/** Map ClaimBatch + claims into export claim_data shape. */
export function buildClaimDataFromBatch(batch: {
  label: string;
  batchType?: string | null;
  claims: Array<{
    expenseDate: Date | string;
    amount: { toString(): string } | number;
    approvedAmount?: { toString(): string } | number | null;
    workType?: string | null;
    claimType?: string;
    staff: { firstName: string; lastName: string };
    expensePayer?: { firstName: string; lastName: string } | null;
    client?: { name: string } | null;
    engagement?: { title: string } | null;
    managerReviewedBy?: { firstName: string; lastName: string } | null;
    participants?: Array<{
      user: { firstName: string; lastName: string };
      workType?: string | null;
      engagement?: { title: string } | null;
    }>;
    managerApprovals?: Array<{
      manager: { firstName: string; lastName: string };
    }>;
  }>;
}): ClaimExportData {
  const claims = batch.claims;
  const travelOnly =
    batch.batchType === 'travel' || (claims.length > 0 && claims.every((c) => c.claimType === 'travel'));
  const title = travelOnly ? 'DETAILS OF TRAVEL EXPENSE' : 'DETAILS OF LATE SITTING EXPENSE';

  const dates = claims
    .map((c) => new Date(c.expenseDate))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  let date_str = batch.label;
  if (dates.length === 1) {
    date_str = dates[0]!.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } else if (dates.length > 1) {
    const a = dates[0]!.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const b = dates[dates.length - 1]!.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    date_str = `${a} – ${b}`;
  }

  const managerSet = new Set<string>();
  for (const c of claims) {
    for (const a of c.managerApprovals ?? []) {
      const n = nameOf(a.manager);
      if (n) managerSet.add(n);
    }
    const n = nameOf(c.managerReviewedBy);
    if (n) managerSet.add(n);
  }

  const clientSet = new Set<string>();
  for (const c of claims) {
    if (c.client?.name) clientSet.add(c.client.name);
  }

  const paid_by: ClaimExportPaidBy[] = claims.map((c) => {
    const payer = c.expensePayer ?? c.staff;
    return { name: nameOf(payer), amount: Number(c.approvedAmount ?? c.amount) };
  });

  const attendees: ClaimExportAttendee[] = [];
  for (const c of claims) {
    const parts = c.participants?.length ? c.participants : null;
    if (parts) {
      for (const p of parts) {
        attendees.push({
          name: nameOf(p.user),
          work: p.engagement?.title ?? p.workType ?? c.workType ?? '',
        });
      }
    } else {
      attendees.push({
        name: nameOf(c.staff),
        work: c.engagement?.title ?? c.workType ?? '',
      });
    }
  }

  return {
    title,
    date_str,
    manager_name: [...managerSet].join(', '),
    client_name: [...clientSet].join(', '),
    submission_date: formatDdMmYyyy(),
    paid_by,
    attendees,
  };
}

export async function generateApprovalExcel(claimData: ClaimExportData, outputPath: string): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1', {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: true }],
  });

  ws.getColumn(1).width = 29;
  ws.getColumn(2).width = 42.5;
  ws.getColumn(3).width = 6;
  ws.getColumn(4).width = 60.1;

  const fontName = 'Palatino Linotype';
  const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
  const med: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF000000' } };

  const title = claimData.title ?? 'DETAILS OF LATE SITTING EXPENSE';
  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = title;
  ws.getRow(1).height = 32;

  ws.getCell('A2').value = 'Date of Late Sitting';
  ws.getCell('C2').value = ':';
  ws.getCell('D2').value = claimData.date_str ?? '';
  ws.getRow(2).height = 30;

  ws.getCell('A3').value = 'Name of Audit Manager';
  ws.getCell('C3').value = ':';
  ws.getCell('D3').value = claimData.manager_name ?? '';
  ws.getRow(3).height = 30;

  ws.getCell('A4').value = 'Name of the Client';
  ws.getCell('C4').value = ':';
  ws.getCell('D4').value = claimData.client_name ?? '';
  ws.getRow(4).height = 30;

  ws.getCell('A5').value = 'No. of. Articles Worked';
  ws.getCell('C5').value = ':';
  ws.getRow(5).height = 30;

  ws.getCell('A6').value = 'PAID BY';
  ws.getCell('B6').value = 'NAME';
  ws.getCell('C6').value = ':';
  ws.getCell('D6').value = 'AMOUNT';
  ws.getRow(6).height = 30;

  const paidBy = claimData.paid_by ?? [];
  let currentRow = 7;
  const paidStart = currentRow;
  paidBy.forEach((item, idx) => {
    ws.getRow(currentRow).height = 28;
    ws.getCell(currentRow, 1).value = idx === 0 ? 1 : { formula: `A${currentRow - 1}+1` };
    ws.getCell(currentRow, 2).value = item.name ?? '';
    ws.getCell(currentRow, 3).value = ':';
    ws.getCell(currentRow, 4).value = Number(item.amount ?? 0);
    ws.getCell(currentRow, 4).numFmt = '#,##0.00';
    currentRow += 1;
  });
  const paidEnd = currentRow - 1;

  ws.getCell(currentRow, 1).value = 'Name of Article Assistants / Managers';
  ws.getRow(currentRow).height = 28;
  currentRow += 1;

  ws.getCell(currentRow, 1).value = 'S.No';
  ws.getCell(currentRow, 2).value = 'Name';
  ws.getCell(currentRow, 4).value = 'Detail of Work Done';
  ws.getRow(currentRow).height = 28;
  currentRow += 1;

  const attendees = claimData.attendees ?? [];
  const attStart = currentRow;
  attendees.forEach((item, idx) => {
    ws.getRow(currentRow).height = 26;
    ws.getCell(currentRow, 1).value = idx === 0 ? 1 : { formula: `A${currentRow - 1}+1` };
    ws.getCell(currentRow, 2).value = item.name ?? '';
    ws.getCell(currentRow, 4).value = item.work ?? '';
    currentRow += 1;
  });
  const attEnd = currentRow - 1;

  ws.getCell('D5').value = attEnd >= attStart ? { formula: `A${attEnd}` } : attendees.length;

  const totalRow = currentRow;
  ws.getRow(totalRow).height = 34;
  ws.getCell(totalRow, 1).value = 'Total Amount of Expenses';
  ws.getCell(totalRow, 3).value = ':';
  ws.getCell(totalRow, 4).value =
    paidEnd >= paidStart ? { formula: `SUM(D${paidStart}:D${paidEnd})` } : 0;
  ws.getCell(totalRow, 4).numFmt = '#,##0.00';
  currentRow += 1;

  const sigRow = currentRow;
  ws.getRow(sigRow).height = 32;
  ws.getCell(sigRow, 1).value = 'Signature of Audit Manager';
  ws.getCell(sigRow, 3).value = ':';
  currentRow += 1;

  const subDateRow = currentRow;
  ws.getRow(subDateRow).height = 30;
  ws.getCell(subDateRow, 1).value = 'Date of Submission';
  ws.getCell(subDateRow, 3).value = ':';
  ws.getCell(subDateRow, 4).value = claimData.submission_date ?? formatDdMmYyyy();

  const lastRow = subDateRow;
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= 4; c++) {
      const cell = ws.getCell(r, c);
      const isTitle = r === 1;
      const isTotalAmt = r === totalRow && c === 4;
      const isAtt = attStart <= r && r <= attEnd;
      cell.font = {
        name: fontName,
        size: isTitle ? 16 : isTotalAmt ? 24 : 15,
        bold: !isAtt,
      };

      cell.border = {
        left: c === 1 ? med : thin,
        right: c === 4 ? med : thin,
        top: r === 1 ? med : thin,
        bottom: r === lastRow ? med : thin,
      };

      if (r === 1) cell.alignment = { horizontal: 'center', vertical: 'middle' };
      else if (c === 3) cell.alignment = { horizontal: 'center', vertical: 'middle' };
      else if ((paidStart <= r && r <= paidEnd && c === 1) || (attStart <= r && r <= attEnd && c === 1)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (paidStart <= r && r <= paidEnd && c === 4) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (r === totalRow && c === 4) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    }
  }

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  await wb.xlsx.writeFile(outputPath);
  return outputPath;
}

export async function generateApprovalPdf(claimData: ClaimExportData, outputPath: string): Promise<string> {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });

  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 12;
  const availW = pageW - 2 * margin;
  const availH = pageH - 20;
  const colW = [
    availW * (29.0 / 137.6),
    availW * (42.5 / 137.6),
    availW * (6.0 / 137.6),
    availW * (60.1 / 137.6),
  ];

  const paidBy = claimData.paid_by ?? [];
  const attendees = claimData.attendees ?? [];
  const title = claimData.title ?? 'DETAILS OF LATE SITTING EXPENSE';

  type Row = [string, string, string, string];
  const rows: Row[] = [];
  rows.push([title, '', '', '']);
  rows.push(['Date of Late Sitting', '', ':', claimData.date_str ?? '']);
  rows.push(['Name of Audit Manager', '', ':', claimData.manager_name ?? '']);
  rows.push(['Name of the Client', '', ':', claimData.client_name ?? '']);
  rows.push(['No. of. Articles Worked', '', ':', String(attendees.length)]);
  rows.push(['PAID BY', 'NAME', ':', 'AMOUNT']);

  let totalAmount = 0;
  const paidStartIdx = rows.length;
  paidBy.forEach((p, idx) => {
    const amt = Number(p.amount ?? 0);
    totalAmount += amt;
    rows.push([
      String(idx + 1),
      p.name ?? '',
      ':',
      `₹ ${amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ]);
  });
  const paidEndIdx = rows.length - 1;

  const attHdrIdx = rows.length;
  rows.push(['Name of Article Assistants / Managers', '', '', '']);
  rows.push(['S.No', 'Name', '', 'Detail of Work Done']);
  const attStartIdx = rows.length;
  attendees.forEach((a, idx) => {
    rows.push([String(idx + 1), a.name ?? '', '', a.work ?? '']);
  });
  const attEndIdx = rows.length - 1;

  const totalRowIdx = rows.length;
  rows.push([
    'Total Amount of Expenses',
    '',
    ':',
    `₹ ${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  ]);
  rows.push(['Signature of Audit Manager', '', ':', '']);
  rows.push(['Date of Submission', '', ':', claimData.submission_date ?? formatDdMmYyyy()]);

  const totalRows = rows.length;
  const baseH = Math.min(24, (availH - 15) / (totalRows + 0.4));
  const rowHeights = rows.map((_, i) => {
    if (i === 0) return baseH * 1.15;
    if (i === totalRowIdx) return baseH * 1.25;
    return baseH;
  });

  const dataFont = totalRows > 35 ? 8.5 : 9.5;
  const titleFont = totalRows > 35 ? 11.5 : 13;
  const totalFont = totalRows > 35 ? 12 : 14;

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    doc.on('error', reject);

    let y = 10;
    const x0 = margin;
    const tableH = rowHeights.reduce((s, h) => s + h, 0);

    const drawCell = (
      x: number,
      cellY: number,
      w: number,
      h: number,
      text: string,
      opts: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right' }
    ) => {
      doc.rect(x, cellY, w, h).lineWidth(0.5).stroke();
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size ?? dataFont);
      const pad = 3;
      doc.text(text, x + pad, cellY + Math.max(2, (h - (opts.size ?? dataFont)) / 2 - 1), {
        width: w - pad * 2,
        align: opts.align ?? 'left',
        lineBreak: false,
        ellipsis: true,
      });
    };

    rows.forEach((row, ri) => {
      const h = rowHeights[ri]!;
      let x = x0;
      const isTitle = ri === 0;
      const isAttHdr = ri === attHdrIdx;
      const isAttData = ri >= attStartIdx && ri <= attEndIdx;
      const isPaidData = ri >= paidStartIdx && ri <= paidEndIdx && paidBy.length > 0;
      const isTotal = ri === totalRowIdx;
      const isSig = ri > totalRowIdx;
      const isHeaderBlock = ri >= 1 && ri <= 4;

      if (isTitle || isAttHdr) {
        doc.rect(x0, y, availW, h).lineWidth(0.5).stroke();
        doc.font('Helvetica-Bold').fontSize(isTitle ? titleFont : dataFont);
        doc.text(row[0], x0 + 3, y + Math.max(2, (h - (isTitle ? titleFont : dataFont)) / 2 - 1), {
          width: availW - 6,
          align: isTitle ? 'center' : 'left',
          lineBreak: false,
          ellipsis: true,
        });
      } else {
        for (let ci = 0; ci < 4; ci++) {
          if ((isHeaderBlock || isTotal || isSig) && ci === 1) continue;
          if ((isHeaderBlock || isTotal || isSig) && ci === 0) {
            const spanW = colW[0]! + colW[1]!;
            drawCell(x, y, spanW, h, row[0], {
              bold: true,
              size: isTotal ? dataFont + 1 : dataFont,
              align: 'left',
            });
            x += spanW;
            continue;
          }
          const w = colW[ci]!;
          let align: 'left' | 'center' | 'right' = 'left';
          if (ci === 2) align = 'center';
          else if (isPaidData && ci === 0) align = 'center';
          else if (isPaidData && ci === 3) align = 'right';
          else if (isAttData && ci === 0) align = 'center';
          else if (isTotal && ci === 3) align = 'center';
          else if (ri === attHdrIdx + 1 && ci === 0) align = 'center';

          const bold = !isAttData;
          const size = isTotal && ci === 3 ? totalFont : isAttData ? dataFont - 0.5 : dataFont;
          drawCell(x, y, w, h, row[ci] ?? '', { bold, size, align });
          x += w;
        }
      }
      y += h;
    });

    doc.lineWidth(1.5).rect(x0, 10, availW, tableH).stroke();
    doc.end();
  });

  return outputPath;
}
