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

/**
 * Import HR Excel client names as real CRM Client rows (engagements/billing).
 * Idempotent: skips names that already exist for the firm (case-insensitive trim).
 */
export async function importCrmClientsFromHrList(firmId: string): Promise<{
  sourceCount: number;
  created: number;
  skippedExisting: number;
}> {
  const seed = loadSeedFile();
  const names = [...new Set(seed.clients.map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) {
    return { sourceCount: 0, created: 0, skippedExisting: 0 };
  }

  const existing = await prisma.client.findMany({
    where: { firmId },
    select: { name: true },
  });
  const existingKey = new Set(existing.map((c) => c.name.trim().toLowerCase()));

  const toCreate = names.filter((n) => !existingKey.has(n.toLowerCase()));
  const CHUNK = 100;
  let created = 0;
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const slice = toCreate.slice(i, i + CHUNK);
    const result = await prisma.client.createMany({
      data: slice.map((name) => ({
        firmId,
        name,
        status: 'Prospect',
        isActive: true,
      })),
    });
    created += result.count;
  }

  // Chunk createMany — avoid empty dead branch after ensureFirmLookupsSeeded
  logger.info('Imported CRM clients from HR list', {
    firmId,
    sourceCount: names.length,
    created,
    skipped: names.length - toCreate.length,
  });

  // Attendance dropdown list (if empty)
  await ensureFirmLookupsSeeded(firmId);
  const lookupCount = await prisma.firmLookupValue.count({
    where: { firmId, kind: LOOKUP_CLIENT },
  });
  if (lookupCount === 0 && names.length > 0) {
    await prisma.firmLookupValue.createMany({
      data: names.map((value, i) => ({
        firmId,
        kind: LOOKUP_CLIENT,
        value,
        sortOrder: i,
      })),
      skipDuplicates: true,
    });
  }

  return {
    sourceCount: names.length,
    created,
    skippedExisting: names.length - toCreate.length,
  };
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
