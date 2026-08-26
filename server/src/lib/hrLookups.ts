import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import prisma from './prisma.js';
import logger from './logger.js';

export const LOOKUP_CLIENT = 'attendance_client';
export const LOOKUP_ACTIVITY = 'activity_classification';
export const LOOKUP_HOLIDAY = 'firm_holiday';

type SeedPayload = { clients: string[]; activities: string[] };

function loadSeedFile(): SeedPayload {
  const candidates = [
    join(process.cwd(), 'seed-data', 'hr-attendance-lookups.json'),
    join(process.cwd(), 'server', 'seed-data', 'hr-attendance-lookups.json'),
    // legacy paths (local only; gitignored)
    join(process.cwd(), 'data', 'hr-attendance-lookups.json'),
    join(process.cwd(), 'server', 'data', 'hr-attendance-lookups.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf8')) as SeedPayload;
    }
  }
  logger.warn('hr-attendance-lookups.json not found; lookups stay empty until seeded');
  return { clients: [], activities: [] };
}

/** Ensure firm has HR client/activity masters from the Excel seed (idempotent). */
export async function ensureFirmLookupsSeeded(firmId: string): Promise<void> {
  const existing = await prisma.firmLookupValue.count({
    where: { firmId, kind: LOOKUP_CLIENT },
  });
  if (existing > 0) return;

  const seed = loadSeedFile();
  if (seed.clients.length === 0 && seed.activities.length === 0) return;

  const rows = [
    ...seed.clients.map((value, i) => ({
      firmId,
      kind: LOOKUP_CLIENT,
      value,
      sortOrder: i,
    })),
    ...seed.activities.map((value, i) => ({
      firmId,
      kind: LOOKUP_ACTIVITY,
      value,
      sortOrder: i,
    })),
  ];

  await prisma.firmLookupValue.createMany({ data: rows, skipDuplicates: true });
  logger.info('Seeded firm attendance lookups', {
    firmId,
    clients: seed.clients.length,
    activities: seed.activities.length,
  });
}

export type HrClientCsvRow = {
  name: string;
  pan?: string;
  gstin?: string;
  contactEmail?: string;
  contactPhone?: string;
};

/** Minimal CSV parser (quoted fields, commas). No new dependency. */
export function parseHrClientCsv(text: string): HrClientCsvRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  function splitLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === ',' && !inQ) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  const header = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s_]+/g, ''));
  const idx = (aliases: string[]) => {
    for (const a of aliases) {
      const i = header.indexOf(a);
      if (i >= 0) return i;
    }
    return -1;
  };

  const nameI = idx(['name', 'clientname', 'client', 'legalname']);
  const panI = idx(['pan']);
  const gstinI = idx(['gstin', 'gst']);
  const emailI = idx(['contactemail', 'email']);
  const phoneI = idx(['contactphone', 'phone', 'mobile']);

  // No header row — treat first column as name (legacy one-column list)
  const hasHeader = nameI >= 0 || header.some((h) => ['pan', 'gstin', 'email'].includes(h));
  const start = hasHeader ? 1 : 0;
  const nCol = hasHeader ? nameI : 0;
  if (nCol < 0) return [];

  const rows: HrClientCsvRow[] = [];
  const seen = new Set<string>();
  for (let li = start; li < lines.length; li++) {
    const cols = splitLine(lines[li]);
    const name = (cols[nCol] || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      name,
      pan: panI >= 0 ? cols[panI]?.trim() || undefined : undefined,
      gstin: gstinI >= 0 ? cols[gstinI]?.trim() || undefined : undefined,
      contactEmail: emailI >= 0 ? cols[emailI]?.trim() || undefined : undefined,
      contactPhone: phoneI >= 0 ? cols[phoneI]?.trim() || undefined : undefined,
    });
  }
  return rows;
}

/**
 * Upsert CRM clients from HR CSV/seed rows.
 * Creates Active clients; updates pan/gstin/contact on match; activates Prospect matches.
 */
export async function importCrmClientsFromRows(
  firmId: string,
  rows: HrClientCsvRow[]
): Promise<{
  sourceCount: number;
  created: number;
  updated: number;
  skippedExisting: number;
  activatedExisting: number;
}> {
  const unique = rows.filter((r) => r.name.trim());
  if (unique.length === 0) {
    return { sourceCount: 0, created: 0, updated: 0, skippedExisting: 0, activatedExisting: 0 };
  }

  const existing = await prisma.client.findMany({
    where: { firmId },
    select: {
      id: true,
      name: true,
      status: true,
      pan: true,
      gstin: true,
      contactEmail: true,
      contactPhone: true,
    },
  });
  const byKey = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));

  let created = 0;
  let updated = 0;
  let activatedExisting = 0;
  let skippedExisting = 0;

  for (const row of unique) {
    const key = row.name.trim().toLowerCase();
    const found = byKey.get(key);
    if (!found) {
      await prisma.client.create({
        data: {
          firmId,
          name: row.name.trim(),
          status: 'Active',
          isActive: true,
          pan: row.pan || null,
          gstin: row.gstin || null,
          contactEmail: row.contactEmail || null,
          contactPhone: row.contactPhone || null,
        },
      });
      created++;
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (found.status === 'Prospect') {
      patch.status = 'Active';
      patch.isActive = true;
      activatedExisting++;
    }
    if (row.pan && row.pan !== found.pan) patch.pan = row.pan;
    if (row.gstin && row.gstin !== found.gstin) patch.gstin = row.gstin;
    if (row.contactEmail && row.contactEmail !== found.contactEmail) patch.contactEmail = row.contactEmail;
    if (row.contactPhone && row.contactPhone !== found.contactPhone) patch.contactPhone = row.contactPhone;

    if (Object.keys(patch).length > 0) {
      await prisma.client.update({ where: { id: found.id }, data: patch });
      updated++;
    } else {
      skippedExisting++;
    }
  }

  // Keep attendance client-name lookup in sync with CSV names
  const names = unique.map((r) => r.name.trim());
  await prisma.firmLookupValue.createMany({
    data: names.map((value, i) => ({
      firmId,
      kind: LOOKUP_CLIENT,
      value,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });

  logger.info('Imported CRM clients from rows', {
    firmId,
    sourceCount: unique.length,
    created,
    updated,
    activatedExisting,
    skippedExisting,
  });

  return {
    sourceCount: unique.length,
    created,
    updated,
    skippedExisting,
    activatedExisting,
  };
}

/** Seed-file import (bundled 689 list) — names only. */
export async function importCrmClientsFromHrList(firmId: string) {
  const seed = loadSeedFile();
  return importCrmClientsFromRows(
    firmId,
    seed.clients.map((name) => ({ name }))
  );
}

export async function listLookupValues(firmId: string, kind: string): Promise<string[]> {
  await ensureFirmLookupsSeeded(firmId);
  const rows = await prisma.firmLookupValue.findMany({
    where: { firmId, kind, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }],
    select: { value: true },
  });
  return rows.map((r) => r.value);
}

/** IST calendar date YYYY-MM-DD from a Date. */
export function istYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Sunday (IST) or date present in firm_holiday lookups. */
export async function isCompOffEligibleDate(firmId: string, workDate: Date): Promise<boolean> {
  const ymd = istYmd(workDate);
  const [y, m, day] = ymd.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, day, 6, 30, 0));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(probe);
  if (weekday === 'Sun') return true;

  const holiday = await prisma.firmLookupValue.findFirst({
    where: { firmId, kind: LOOKUP_HOLIDAY, value: ymd, isActive: true },
    select: { id: true },
  });
  return Boolean(holiday);
}
