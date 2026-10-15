import ExcelJS from 'exceljs';

export type DueKind = 'date' | 'not_applicable' | 'unclear';

export type ParsedGstNoticeRow = {
  rowIndex: number;
  noticeOrderId: string;
  type: string | null;
  description: string | null;
  issueDate: Date | null;
  dueDate: Date | null;
  dueKind: DueKind;
  period: string | null;
  sourceStatus: string | null;
  assignedTo: string | null;
  skipReason?: string;
};

export type GstNoticeImportParseResult = {
  gstin: string | null;
  gstinSource: 'Basic!A2' | 'none';
  sheetName: string | null;
  rows: ParsedGstNoticeRow[];
  skipped: { rowIndex: number; reason: string }[];
  partial: boolean;
};

const ID_HEADERS = [
  'notice/demand order id',
  'notice/ demand order id',
  'notice / order id',
  'notice/order id',
  'notice / order id',
];
const TYPE_HEADERS = ['type', 'type •'];
const DESC_HEADERS = ['notice / order description', 'notice/order description', 'description'];
const ISSUE_HEADERS = ['date of issuance', 'date of issue', 'issue date'];
const DUE_HEADERS = ['due date'];
const PERIOD_HEADERS = ['period', 'fy', 'financial year'];
const STATUS_HEADERS = ['status', 'notice status'];
const ASSIGNED_HEADERS = ['assigned to', 'assignedto'];

function normHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[•·]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cellText(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).replace(/\u00a0/g, ' ').trim();
  return s || null;
}

function parseDateCell(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const s = cellText(value);
  if (!s) return null;
  // Excel serial
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const epoch = Date.UTC(1899, 11, 30);
      const d = new Date(epoch + Math.round(n) * 86400000);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
  }
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    let y = Number(mdy[3]);
    if (y < 100) y += 2000;
    const a = Number(mdy[1]);
    const b = Number(mdy[2]);
    // Prefer D/M/Y when day > 12; else treat as M/D/Y (portal exports)
    const dayFirst = a > 12;
    const day = dayFirst ? a : b;
    const month = dayFirst ? b : a;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(y, month - 1, day));
    }
  }
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) {
    const d = new Date(iso);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return null;
}

/** Spec: NA → not applicable; As Applicable* / blank / em dash → unclear. */
export function parseDueDate(value: unknown): { dueDate: Date | null; dueKind: DueKind } {
  const s = cellText(value);
  if (!s) return { dueDate: null, dueKind: 'unclear' };
  const compact = s.replace(/\s+/g, ' ').trim();
  if (/^na$/i.test(compact) || /^n\/a$/i.test(compact)) {
    return { dueDate: null, dueKind: 'not_applicable' };
  }
  if (
    /^as applicable/i.test(compact) ||
    compact === '—' ||
    compact === '-' ||
    compact === '–' ||
    compact === '—'
  ) {
    return { dueDate: null, dueKind: 'unclear' };
  }
  // Single letter junk like "d" from sample → unclear
  if (compact.length <= 2 && !/^\d+$/.test(compact)) {
    return { dueDate: null, dueKind: 'unclear' };
  }
  const dueDate = parseDateCell(value);
  if (!dueDate) return { dueDate: null, dueKind: 'unclear' };
  return { dueDate, dueKind: 'date' };
}

export function normalizeGstin(value: string | null | undefined): string | null {
  if (!value) return null;
  const g = value.replace(/\s+/g, '').toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return null;
  return g;
}

function mapHeaderIndex(headers: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = normHeader(h);
    if (!key) return;
    if (ID_HEADERS.includes(key)) map.id = i;
    else if (TYPE_HEADERS.some((t) => key === t || key.startsWith('type'))) map.type = i;
    else if (DESC_HEADERS.includes(key)) map.description = i;
    else if (ISSUE_HEADERS.includes(key)) map.issue = i;
    else if (DUE_HEADERS.includes(key)) map.due = i;
    else if (PERIOD_HEADERS.includes(key)) map.period = i;
    else if (STATUS_HEADERS.includes(key)) map.status = i;
    else if (ASSIGNED_HEADERS.includes(key)) map.assigned = i;
  });
  return map;
}

function pickSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  const exact = workbook.getWorksheet('Notices');
  if (exact) return exact;
  const pending = workbook.getWorksheet('Pending Notices');
  if (pending) return pending;
  const byName = workbook.worksheets.find((ws) => /notice/i.test(ws.name));
  return byName || null;
}

function rowValues(row: ExcelJS.Row, colCount: number): unknown[] {
  const out: unknown[] = [];
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    out.push(cell.value instanceof Date ? cell.value : cell.text ?? cell.value);
  }
  return out;
}

export async function parseGstNoticeWorkbook(buffer: Buffer): Promise<GstNoticeImportParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  let gstin: string | null = null;
  let gstinSource: 'Basic!A2' | 'none' = 'none';
  const basic = workbook.getWorksheet('Basic');
  if (basic) {
    const raw = cellText(basic.getCell('A2').value);
    gstin = normalizeGstin(raw);
    gstinSource = 'Basic!A2';
  }

  const sheet = pickSheet(workbook);
  if (!sheet) {
    return {
      gstin,
      gstinSource,
      sheetName: null,
      rows: [],
      skipped: [{ rowIndex: 0, reason: 'No Notices (or Pending Notices) sheet found' }],
      partial: true,
    };
  }

  const colCount = Math.max(sheet.columnCount || 0, 12);
  let headerRowNum = 0;
  let colMap: Record<string, number> = {};
  for (let r = 1; r <= Math.min(sheet.rowCount || 1, 15); r++) {
    const vals = rowValues(sheet.getRow(r), colCount);
    const mapped = mapHeaderIndex(vals);
    if (mapped.id != null && (mapped.description != null || mapped.type != null)) {
      headerRowNum = r;
      colMap = mapped;
      break;
    }
  }

  if (!headerRowNum || colMap.id == null) {
    return {
      gstin,
      gstinSource,
      sheetName: sheet.name,
      rows: [],
      skipped: [{ rowIndex: 0, reason: 'Could not find Notice/Demand Order Id header on Notices sheet' }],
      partial: true,
    };
  }

  const rows: ParsedGstNoticeRow[] = [];
  const skipped: { rowIndex: number; reason: string }[] = [];
  const seenIds = new Set<string>();

  for (let r = headerRowNum + 1; r <= (sheet.rowCount || headerRowNum); r++) {
    const vals = rowValues(sheet.getRow(r), colCount);
    const idRaw = cellText(vals[colMap.id]);
    if (!idRaw) continue;
    if (/^insert new notices/i.test(idRaw)) continue;

    const noticeOrderId = idRaw.trim();
    if (seenIds.has(noticeOrderId.toUpperCase())) {
      skipped.push({ rowIndex: r, reason: `Duplicate Notice/Order ID in workbook: ${noticeOrderId}` });
      continue;
    }
    seenIds.add(noticeOrderId.toUpperCase());

    if (noticeOrderId.length < 5) {
      skipped.push({ rowIndex: r, reason: 'Notice/Order ID too short' });
      continue;
    }

    const due = parseDueDate(colMap.due != null ? vals[colMap.due] : null);
    rows.push({
      rowIndex: r,
      noticeOrderId,
      type: colMap.type != null ? cellText(vals[colMap.type]) : null,
      description: colMap.description != null ? cellText(vals[colMap.description]) : null,
      issueDate: colMap.issue != null ? parseDateCell(vals[colMap.issue]) : null,
      dueDate: due.dueDate,
      dueKind: due.dueKind,
      period: colMap.period != null ? cellText(vals[colMap.period]) : null,
      sourceStatus: colMap.status != null ? cellText(vals[colMap.status]) : null,
      assignedTo: colMap.assigned != null ? cellText(vals[colMap.assigned]) : null,
    });
  }

  return {
    gstin,
    gstinSource,
    sheetName: sheet.name,
    rows,
    skipped,
    partial: gstinSource === 'none' || !gstin,
  };
}

export function portalFieldChanged(
  prev: string | Date | null | undefined,
  next: string | Date | null | undefined
): boolean {
  if (next == null || next === '') return false; // blank does not erase
  if (prev instanceof Date || next instanceof Date) {
    const a = prev instanceof Date ? prev.toISOString().slice(0, 10) : prev ? String(prev).slice(0, 10) : '';
    const b = next instanceof Date ? next.toISOString().slice(0, 10) : String(next).slice(0, 10);
    return a !== b;
  }
  return String(prev ?? '').trim() !== String(next).trim();
}

/** Auto status label from due kind / date (IST calendar day). */
export function autoStatusLabel(dueKind: DueKind, dueDate: Date | null, today = new Date()): string {
  if (dueKind === 'not_applicable') return 'Not applicable';
  if (dueKind === 'unclear' || !dueDate) return 'Refer to notice document';
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const d = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const days = Math.round((d - t) / 86400000);
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Due today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export function effectiveNoticeFields(n: {
  portalType: string | null;
  portalDescription: string | null;
  portalIssueDate: Date | null;
  portalDueDate: Date | null;
  portalDueKind: string;
  portalPeriod: string | null;
  overrideType: string | null;
  overrideDescription: string | null;
  overrideIssueDate: Date | null;
  overrideDueDate: Date | null;
  overrideDueKind: string | null;
  overridePeriod: string | null;
  appStatus: string;
  customStatus: string | null;
  followUp: string;
  customFollowUp: string | null;
  followUpDueDate: Date | null;
  assignedTo: string | null;
  notes: string | null;
  viewState: string;
}) {
  const dueKind = (n.overrideDueKind || n.portalDueKind || 'unclear') as DueKind;
  const dueDate = n.overrideDueDate ?? n.portalDueDate;
  const type = n.overrideType ?? n.portalType;
  const description = n.overrideDescription ?? n.portalDescription;
  const issueDate = n.overrideIssueDate ?? n.portalIssueDate;
  const period = n.overridePeriod ?? n.portalPeriod;
  const primaryStatus =
    n.appStatus === 'Custom'
      ? n.customStatus || 'Custom'
      : n.appStatus === 'Auto'
        ? autoStatusLabel(dueKind, dueDate)
        : n.appStatus;
  const followUpLabel =
    n.followUp === 'Custom' ? n.customFollowUp || 'Custom' : n.followUp === 'None' ? null : n.followUp;
  return {
    type,
    description,
    issueDate,
    dueDate,
    dueKind,
    period,
    primaryStatus,
    followUpLabel,
    followUpDueDate: n.followUp === 'None' ? null : n.followUpDueDate,
    assignedTo: n.assignedTo,
    notes: n.notes,
    viewState: n.viewState,
  };
}
