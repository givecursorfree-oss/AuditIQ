import ExcelJS from 'exceljs';
import prisma from './prisma.js';
import { getAttendanceDateKey, getAttendanceDayRange } from './attendanceDates.js';
import logger from './logger.js';

/** Canonical columns from eSSL / Organization-Wise Attendance export. */
export const BIOMETRIC_IMPORT_HEADERS = [
  'employeeCode',
  'name',
  'date',
  'inTime',
  'outTime',
  'workHrs',
] as const;

export type BiometricMatchAction = 'use_code' | 'use_name' | 'manual' | 'unresolved';

export type StagedBiometricRow = {
  rowIndex: number;
  employeeCode: string;
  bioName: string;
  date: string; // YYYY-MM-DD
  inTime: string | null;
  outTime: string | null;
  workHrs: string | null;
  matchAction: BiometricMatchAction;
  matchedUserId: string | null;
  matchedUserName: string | null;
  errors: string[];
  warnings: string[];
};

export type ParsedBioPunch = {
  employeeCode: string;
  bioName: string;
  date: string;
  inTime: string | null;
  outTime: string | null;
  workHrs: string | null;
  rowIndex: number;
};

function cellStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') {
    if (v > 0 && v < 1) {
      // Excel time fraction
      const totalMins = Math.round(v * 24 * 60);
      const h = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return String(v);
  }
  if (v instanceof Date) {
    const h = v.getHours();
    const m = v.getMinutes();
    if (h || m) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'object' && v !== null && 'text' in v) {
    return String((v as { text: unknown }).text ?? '').trim();
  }
  if (typeof v === 'object' && v !== null && 'result' in v) {
    return cellStr((v as { result: unknown }).result);
  }
  return String(v).trim();
}

export function foldPersonName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Normalize device User ID (11, 11.0 → "11"). */
export function normalizeEmployeeCode(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const n = Number(s);
  if (Number.isFinite(n) && String(n) === s.replace(/\.0+$/, '')) return String(Math.trunc(n));
  if (/^\d+(\.0+)?$/.test(s)) return String(Math.trunc(Number(s)));
  return s;
}

/** Accept HH:mm, H:mm, Excel time strings. */
export function normalizeClock(raw: string): string | null {
  const s = raw.trim();
  if (!s || /^ab$/i.test(s) || /^in$/i.test(s) || s === '-' || s === '—') return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD */
export function normalizeBioDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return null;
}

function headerKey(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
}

/**
 * Parse Organization-Wise Attendance sheet (header often on row 6, merged In/Out cols).
 * Also accepts a flat template with BIOMETRIC_IMPORT_HEADERS.
 */
function excelSerialToIso(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

function parseDateCell(raw: unknown): string | null {
  if (typeof raw === 'number') return excelSerialToIso(raw) ?? normalizeBioDate(String(raw));
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = cellStr(raw);
  return normalizeBioDate(s) ?? (Number(s) ? excelSerialToIso(Number(s)) : null);
}

/** Minutes from HH:mm. Overnight: out < in → add 24h. */
export function elapsedClockMinutes(inTime: string | null, outTime: string | null): number | null {
  const a = inTime ? normalizeClock(inTime) : null;
  const b = outTime ? normalizeClock(outTime) : null;
  if (!a || !b) return null;
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  let mins = bh! * 60 + bm! - (ah! * 60 + am!);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

export function formatHoursMinutes(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function parseBiometricMatrix(matrix: unknown[][]): ParsedBioPunch[] {
  if (!matrix.length) return [];

  let headerRow = -1;
  for (let r = 0; r < Math.min(20, matrix.length); r++) {
    const cells = matrix[r]!.map((c) => headerKey(cellStr(c)));
    const joined = cells.join('|');
    if (
      (joined.includes('user id') || joined.includes('employee code') || cells.includes('employeecode')) &&
      cells.some((c) => c === 'name' || c.includes('name'))
    ) {
      headerRow = r;
      break;
    }
  }

  if (headerRow < 0) {
    const first = matrix[0]!.map((c) => headerKey(cellStr(c)));
    if (first.includes('employeecode') || first.includes('employee code')) {
      headerRow = 0;
    }
  }
  if (headerRow < 0) return [];

  const headers = matrix[headerRow]!.map((c) => headerKey(cellStr(c)));
  const exact = (aliases: string[]): number => {
    for (let i = 0; i < headers.length; i++) {
      if (aliases.includes(headers[i]!)) return i;
    }
    return -1;
  };
  const col = (aliases: string[]): number => {
    const hit = exact(aliases);
    if (hit >= 0) return hit;
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i]!;
      if (aliases.some((a) => h.includes(a))) return i;
    }
    return -1;
  };

  const codeCol = col(['user id', 'employeecode', 'employee code', 'emp id', 'emp code']);
  const nameCol = exact(['name']) >= 0 ? exact(['name']) : col(['name']);
  const dateCol = col(['date']);
  const shiftCol = exact(['shift']);
  const inBareCol = exact(['in']);
  const inTimeCol = exact(['in time', 'intime']);
  const outTimeCol = exact(['out time', 'outtime', 'out']);
  const otCol = exact(['ot']);
  const workCol = col(['work hrs', 'workhrs', 'work hours']);
  const flatIn = exact(['intime', 'in time']);
  const flatOut = exact(['outtime', 'out time']);

  // Device export headings are wrong: Shift = Bio In, next In = Bio Out, OT = reported hrs.
  const unusualLayout = shiftCol >= 0 && inBareCol >= 0 && inBareCol !== shiftCol;

  const out: ParsedBioPunch[] = [];
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const code = normalizeEmployeeCode(codeCol >= 0 ? cellStr(row[codeCol]) : '');
    const bioName = nameCol >= 0 ? cellStr(row[nameCol]) : '';
    if (!code && !bioName) continue;
    if (/^user id$/i.test(code) || /^name$/i.test(bioName)) continue;

    const date = dateCol >= 0 ? parseDateCell(row[dateCol]) : null;

    let inTime: string | null = null;
    let outTime: string | null = null;
    if (unusualLayout) {
      inTime = normalizeClock(cellStr(row[shiftCol]));
      outTime = normalizeClock(cellStr(row[inBareCol]));
    } else if (flatIn >= 0 || inTimeCol >= 0 || outTimeCol >= 0) {
      const iCol = flatIn >= 0 ? flatIn : inTimeCol;
      inTime = iCol >= 0 ? normalizeClock(cellStr(row[iCol])) : null;
      outTime = outTimeCol >= 0 ? normalizeClock(cellStr(row[outTimeCol])) : null;
    }

    if (!inTime && !outTime) {
      const clocks: string[] = [];
      for (let c = 0; c < row.length; c++) {
        if (c === codeCol || c === nameCol || c === dateCol) continue;
        const t = normalizeClock(cellStr(row[c]));
        if (t) clocks.push(t);
      }
      inTime = clocks[0] ?? null;
      outTime = clocks.length > 1 ? clocks[clocks.length - 1]! : null;
    }

    const reported = otCol >= 0 ? cellStr(row[otCol]) : workCol >= 0 ? cellStr(row[workCol]) : '';
    const workHrs = reported || null;

    out.push({
      employeeCode: code,
      bioName,
      date: date || '',
      inTime,
      outTime,
      workHrs,
      rowIndex: r + 1,
    });
  }
  return out;
}

export async function rowsFromWorkbookBuffer(buffer: Buffer): Promise<ParsedBioPunch[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const matrix: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const vals: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      vals[colNumber - 1] = cell.value;
    });
    matrix[rowNumber - 1] = vals;
  });
  return parseBiometricMatrix(matrix);
}

export async function rowsFromCsvText(text: string): Promise<ParsedBioPunch[]> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const matrix = lines.map((line) => {
    // simple CSV split (quoted fields rare in bio exports)
    return line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
  });
  return parseBiometricMatrix(matrix);
}

export async function buildBiometricImportTemplateBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Biometric');
  ws.addRow([...BIOMETRIC_IMPORT_HEADERS]);
  ws.addRow(['76', 'Pragadisan M', '2026-10-01', '10:12', '18:38', '8:26']);
  ws.getRow(1).font = { bold: true };
  const note = wb.addWorksheet('Notes');
  note.addRow(['Paste device export. Headings are unusual: Shift = Bio In, In = Bio Out, OT = hours.']);
  note.addRow(['Or use this flat template. Save device .xls as .xlsx before upload.']);
  note.addRow(['Map User ID to staff once; later uploads reuse the mapping.']);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

export function minutesDiffClock(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const na = normalizeClock(a);
  const nb = normalizeClock(b);
  if (!na || !nb) return null;
  return Math.abs(clockToMinutes(na) - clockToMinutes(nb));
}

/** Format Date as HH:mm in Asia/Kolkata. */
export function formatIstHmFromDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  let hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  if (hour === '24') hour = '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

export async function stageBiometricImportRows(
  firmId: string,
  punches: ParsedBioPunch[]
): Promise<{ rows: StagedBiometricRow[]; summary: { total: number; ready: number; blocked: number } }> {
  const staff = await prisma.user.findMany({
    where: {
      firmId,
      isActive: true,
      role: { not: 'Client' },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeProfile: { select: { employeeCode: true } },
    },
  });

  const byCode = new Map<string, { id: string; name: string }>();
  const byFoldName = new Map<string, { id: string; name: string }[]>();
  for (const u of staff) {
    const name = `${u.firstName} ${u.lastName}`.trim();
    const code = u.employeeProfile?.employeeCode
      ? normalizeEmployeeCode(u.employeeProfile.employeeCode)
      : '';
    if (code) byCode.set(code, { id: u.id, name });
    const fold = foldPersonName(name);
    if (!fold) continue;
    const list = byFoldName.get(fold) || [];
    list.push({ id: u.id, name });
    byFoldName.set(fold, list);
  }

  const rows: StagedBiometricRow[] = punches.map((p) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!p.employeeCode) errors.push('Missing User ID / employee code');
    if (!p.date) errors.push('Invalid or missing date');
    if (!p.inTime && !p.outTime) warnings.push('No In/Out times');
    const calcMins = elapsedClockMinutes(p.inTime, p.outTime);
    const otMins = p.workHrs ? elapsedClockMinutes('00:00', normalizeClock(p.workHrs) || p.workHrs) : null;
    if (calcMins != null && otMins != null && Math.abs(calcMins - otMins) > 15) {
      warnings.push(
        `OT ${p.workHrs} ≠ elapsed ${formatHoursMinutes(calcMins)} — using timestamps`
      );
    }

    let matchAction: BiometricMatchAction = 'unresolved';
    let matchedUserId: string | null = null;
    let matchedUserName: string | null = null;

    const codeHit = p.employeeCode ? byCode.get(p.employeeCode) : undefined;
    if (codeHit) {
      matchAction = 'use_code';
      matchedUserId = codeHit.id;
      matchedUserName = codeHit.name;
    } else {
      const fold = foldPersonName(p.bioName);
      const nameHits = fold ? byFoldName.get(fold) : undefined;
      if (nameHits?.length === 1) {
        matchAction = 'use_name';
        matchedUserId = nameHits[0]!.id;
        matchedUserName = nameHits[0]!.name;
        warnings.push('Matched by name — confirm or set employeeCode on staff profile');
      } else if (nameHits && nameHits.length > 1) {
        errors.push('Multiple staff match this name — pick manually');
      } else if (p.employeeCode) {
        errors.push('No staff with this employeeCode — set code on profile or pick user');
      }
    }

    return {
      rowIndex: p.rowIndex,
      employeeCode: p.employeeCode,
      bioName: p.bioName,
      date: p.date,
      inTime: p.inTime,
      outTime: p.outTime,
      workHrs: p.workHrs,
      matchAction,
      matchedUserId,
      matchedUserName,
      errors,
      warnings,
    };
  });

  const ready = rows.filter((r) => rowReadyToImport(r)).length;
  return {
    rows,
    summary: { total: rows.length, ready, blocked: rows.length - ready },
  };
}

export function rowReadyToImport(row: StagedBiometricRow): boolean {
  if (row.errors.length) return false;
  if (!row.matchedUserId) return false;
  if (!row.date || !row.employeeCode) return false;
  return true;
}

function dateOnlyUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export async function confirmBiometricImport(input: {
  firmId: string;
  actorId: string;
  rows: StagedBiometricRow[];
  writeEmployeeCodes?: boolean;
}): Promise<{
  upserted: number;
  skipped: number;
  flagged: number;
  bioPresentUpdated: number;
  failed: { rowIndex: number; error: string }[];
}> {
  const firm = await prisma.firm.findUnique({
    where: { id: input.firmId },
    select: { bioDeviationMinutes: true },
  });
  const limit = firm?.bioDeviationMinutes ?? 30;

  let upserted = 0;
  let skipped = 0;
  let flagged = 0;
  let bioPresentUpdated = 0;
  const failed: { rowIndex: number; error: string }[] = [];

  const ready = input.rows.filter(rowReadyToImport);
  for (const row of input.rows) {
    if (!rowReadyToImport(row)) {
      skipped++;
      continue;
    }
  }

  for (const row of ready) {
    try {
      const userId = row.matchedUserId!;
      const dayKey = dateOnlyUtc(row.date);

      if (input.writeEmployeeCodes !== false && row.employeeCode) {
        const profile = await prisma.employeeProfile.findUnique({ where: { userId } });
        const existingCode = profile?.employeeCode
          ? normalizeEmployeeCode(profile.employeeCode)
          : '';
        if (existingCode && existingCode !== row.employeeCode) {
          logger.warn('Skipped conflicting biometric mapping', {
            userId,
            existingCode,
            incoming: row.employeeCode,
          });
        } else if (!existingCode) {
          const taken = await prisma.employeeProfile.findFirst({
            where: { employeeCode: row.employeeCode, userId: { not: userId } },
            select: { userId: true },
          });
          if (taken) {
            logger.warn('Biometric User ID already mapped to another staff', {
              employeeCode: row.employeeCode,
              existingUserId: taken.userId,
            });
          } else if (profile) {
            await prisma.employeeProfile.update({
              where: { userId },
              data: { employeeCode: row.employeeCode },
            });
          } else {
            await prisma.employeeProfile.create({
              data: { userId, employeeCode: row.employeeCode },
            });
          }
        }
      }

      const dayRange = getAttendanceDayRange(new Date(`${row.date}T12:00:00+05:30`));
      const attendance = await prisma.attendance.findFirst({
        where: {
          userId,
          date: { gte: dayRange.start, lte: dayRange.end },
        },
        select: { id: true, checkIn: true, checkOut: true },
      });

      const appIn = attendance?.checkIn ? formatIstHmFromDate(attendance.checkIn) : null;
      const appOut = attendance?.checkOut ? formatIstHmFromDate(attendance.checkOut) : null;
      const inDev = minutesDiffClock(appIn, row.inTime);
      const outDev = minutesDiffClock(appOut, row.outTime);
      const deviationFlag =
        (inDev != null && inDev > limit) || (outDev != null && outDev > limit);

      await prisma.biometricDay.upsert({
        where: {
          firmId_employeeCode_date: {
            firmId: input.firmId,
            employeeCode: row.employeeCode,
            date: dayKey,
          },
        },
        create: {
          firmId: input.firmId,
          employeeCode: row.employeeCode,
          bioName: row.bioName,
          userId,
          date: dayKey,
          inTime: row.inTime,
          outTime: row.outTime,
          workHrs: row.workHrs,
          checkInDeviationMinutes: inDev,
          checkOutDeviationMinutes: outDev,
          deviationFlag,
        },
        update: {
          bioName: row.bioName,
          userId,
          inTime: row.inTime,
          outTime: row.outTime,
          workHrs: row.workHrs,
          checkInDeviationMinutes: inDev,
          checkOutDeviationMinutes: outDev,
          deviationFlag,
        },
      });
      upserted++;
      if (deviationFlag) flagged++;

      const hasPunch = Boolean(row.inTime || row.outTime);
      if (attendance) {
        await prisma.attendance.update({
          where: { id: attendance.id },
          data: { bioPresent: hasPunch },
        });
        bioPresentUpdated++;
      } else if (hasPunch) {
        // Create minimal attendance day marked present via bio only (HR visibility)
        await prisma.attendance.create({
          data: {
            userId,
            date: dayRange.start,
            status: 'present',
            bioPresent: true,
            method: 'manual',
          },
        });
        bioPresentUpdated++;
      }
    } catch (err) {
      logger.warn('Biometric row import failed', {
        rowIndex: row.rowIndex,
        error: (err as Error).message,
      });
      failed.push({ rowIndex: row.rowIndex, error: (err as Error).message });
    }
  }

  await prisma.auditLog.create({
    data: {
      action: 'BIOMETRIC_IMPORT',
      entity: 'BiometricDay',
      entityId: input.firmId,
      details: JSON.stringify({ upserted, skipped, flagged, bioPresentUpdated, failed: failed.length }),
      userId: input.actorId,
    },
  });

  return { upserted, skipped, flagged, bioPresentUpdated, failed };
}

/** Lookup for claims fingerprint cross-check. */
export async function getStoredFingerprintLogoffTime(
  userId: string,
  date: Date
): Promise<string | null> {
  const key = getAttendanceDateKey(date);
  const day = await prisma.biometricDay.findFirst({
    where: {
      userId,
      date: dateOnlyUtc(key),
    },
    select: { outTime: true, inTime: true },
  });
  return day?.outTime || null;
}

export type AttendanceBioReconcile = {
  bioIn: string | null;
  bioOut: string | null;
  bioHrs: string | null;
  finalIn: string | null;
  finalOut: string | null;
  finalHrs: string | null;
  finalBasis: 'app' | 'bio' | 'matched' | 'bio_out_suggested' | 'none';
  validation: 'ok' | 'review' | 'mismatch' | 'missing_bio' | 'missing_app' | 'abnormal';
};

/** App vs bio for the attendance report. Uncertain Out corrections stay on review (no silent overwrite). */
export function reconcileAttendanceBio(input: {
  appIn: string | null;
  appOut: string | null;
  bioIn: string | null;
  bioOut: string | null;
  bioHrs: string | null;
  deviationMinutes?: number;
}): AttendanceBioReconcile {
  const limit = input.deviationMinutes ?? 30;
  const bioHrsCalc = elapsedClockMinutes(input.bioIn, input.bioOut);
  const bioHrs =
    bioHrsCalc != null ? formatHoursMinutes(bioHrsCalc) : input.bioHrs;

  const inDev = minutesDiffClock(input.appIn, input.bioIn);
  const outDev = minutesDiffClock(input.appOut, input.bioOut);
  const inOk = inDev == null || inDev <= limit;
  const outOk = outDev == null || outDev <= limit;

  let finalIn = input.appIn || input.bioIn;
  let finalOut = input.appOut || input.bioOut;
  let finalBasis: AttendanceBioReconcile['finalBasis'] = 'none';
  let validation: AttendanceBioReconcile['validation'] = 'ok';

  if (!input.bioIn && !input.bioOut) {
    finalBasis = input.appIn || input.appOut ? 'app' : 'none';
    validation = input.appIn ? 'missing_bio' : 'ok';
  } else if (input.appIn && input.appOut && input.bioIn && input.bioOut && inOk && outOk) {
    finalIn = input.appIn;
    finalOut = input.appOut;
    finalBasis = 'matched';
    validation = 'ok';
  } else if (input.appIn && !input.appOut && input.bioOut) {
    finalIn = input.appIn;
    finalOut = input.bioOut;
    finalBasis = 'bio_out_suggested';
    validation = 'review';
  } else if (!input.appIn && !input.appOut && (input.bioIn || input.bioOut)) {
    finalIn = input.bioIn;
    finalOut = input.bioOut;
    finalBasis = 'bio';
    validation = 'missing_app';
  } else if (!inOk || !outOk) {
    finalIn = input.appIn || input.bioIn;
    finalOut = input.appOut || input.bioOut;
    finalBasis = input.appOut ? 'app' : input.bioOut ? 'bio' : 'app';
    validation = 'mismatch';
  } else if (input.appIn || input.appOut) {
    finalBasis = 'app';
  } else {
    finalBasis = 'bio';
  }

  const finalMins = elapsedClockMinutes(finalIn, finalOut);
  if (finalMins != null && finalMins > 16 * 60) validation = 'abnormal';

  return {
    bioIn: input.bioIn,
    bioOut: input.bioOut,
    bioHrs,
    finalIn,
    finalOut,
    finalHrs: finalMins != null ? formatHoursMinutes(finalMins) : null,
    finalBasis,
    validation,
  };
}

/** Build IST Date for YYYY-MM-DD + HH:mm. Overnight: out earlier than in → next calendar day. */
export function istClockOnDate(ymd: string, hhmm: string, afterHm?: string | null): Date {
  const clock = normalizeClock(hhmm) || hhmm;
  let day = ymd;
  if (afterHm) {
    const a = normalizeClock(afterHm);
    const b = normalizeClock(clock);
    if (a && b && clockToMinutes(b) < clockToMinutes(a)) {
      const [y, m, d] = ymd.split('-').map(Number);
      day = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
    }
  }
  return new Date(`${day}T${clock}:00+05:30`);
}

/** HR approves suggested Bio Out onto an open attendance day (forgotten app logout). */
export async function applyBioOutToAttendance(opts: {
  firmId: string;
  actorId: string;
  biometricDayId: string;
}): Promise<{ ok: true; attendanceId: string; checkOut: string } | { ok: false; error: string; status: number }> {
  const bio = await prisma.biometricDay.findFirst({
    where: { id: opts.biometricDayId, firmId: opts.firmId },
  });
  if (!bio) return { ok: false, error: 'Biometric day not found', status: 404 };
  if (!bio.userId) return { ok: false, error: 'Map employee before applying Out', status: 400 };
  if (!bio.outTime) return { ok: false, error: 'No Bio Out on this day', status: 400 };

  const ymd = bio.date.toISOString().slice(0, 10);
  const dayRange = getAttendanceDayRange(new Date(`${ymd}T12:00:00+05:30`));
  const attendance = await prisma.attendance.findFirst({
    where: {
      userId: bio.userId,
      date: { gte: dayRange.start, lte: dayRange.end },
    },
  });
  if (!attendance?.checkIn) {
    return { ok: false, error: 'No app check-in that day to attach Out to', status: 400 };
  }
  if (attendance.checkOut) {
    return { ok: false, error: 'App already has check-out — leave both times as-is', status: 400 };
  }

  const checkOut = istClockOnDate(ymd, bio.outTime, bio.inTime);
  await prisma.attendance.update({
    where: { id: attendance.id },
    data: { checkOut, bioPresent: true, method: attendance.method || 'manual' },
  });
  await prisma.auditLog.create({
    data: {
      action: 'BIO_OUT_APPROVED',
      entity: 'Attendance',
      entityId: attendance.id,
      details: JSON.stringify({
        biometricDayId: bio.id,
        bioOut: bio.outTime,
        checkOut: checkOut.toISOString(),
      }),
      userId: opts.actorId,
    },
  });
  return { ok: true, attendanceId: attendance.id, checkOut: bio.outTime };
}
