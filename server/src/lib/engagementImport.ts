import ExcelJS from 'exceljs';
import prisma from './prisma.js';
import { displayClientName, normalizeClientNameKey } from './recordSource.js';
import { setEngagementTeam } from './engagementTeam.js';
import { writeAuditLog } from './writeAuditLog.js';
import { SERVICE_CATALOG, WORKFLOW_TEMPLATES, resolveTemplateId } from './workflowCatalog.js';
import { inferDomainFromEngagementType } from './workflowEngine.js';
import { generateDataChecklist } from './suggestedTasks.js';
import logger from './logger.js';

export const ENGAGEMENT_TYPES = ['Statutory', 'Tax (44AB)', 'GST', 'Internal', 'Special'] as const;

export const IMPORT_TEMPLATE_HEADERS = [
  'clientName',
  'title',
  'type',
  'financialYear',
  'partnerEmail',
  'managerEmail',
  'articleEmail',
  'serviceCode',
  'startDate',
  'deadline',
  'billingType',
  'billingAmount',
  'scope',
  'notes',
] as const;

export type ClientAction = 'use_existing' | 'create_new' | 'unresolved';
export type EngagementDupAction = 'skip' | 'create_anyway' | 'unresolved';

export type StagedEngagementRow = {
  rowIndex: number;
  clientName: string;
  title: string;
  type: string;
  financialYear: string;
  partnerEmail: string;
  managerEmail: string;
  articleEmail?: string;
  serviceCode?: string;
  startDate?: string;
  deadline?: string;
  billingType?: string;
  billingAmount?: number;
  scope?: string;
  notes?: string;
  // Resolved during staging
  clientAction: ClientAction;
  matchedClientId?: string | null;
  matchedClientName?: string | null;
  partnerId?: string | null;
  managerId?: string | null;
  articleId?: string | null;
  engagementDupAction: EngagementDupAction;
  duplicateEngagementId?: string | null;
  duplicateEngagementTitle?: string | null;
  errors: string[];
  warnings: string[];
};

function cellStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && v !== null && 'text' in v) return String((v as { text: unknown }).text ?? '').trim();
  return String(v).trim();
}

function parseAmount(v: unknown): number | undefined {
  const s = cellStr(v).replace(/,/g, '');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export async function buildEngagementImportTemplateBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Engagements');
  ws.addRow([...IMPORT_TEMPLATE_HEADERS]);
  ws.addRow([
    'Acme Pvt Ltd',
    'GSTR Monthly — FY 2025-26',
    'GST',
    '2025-26',
    'partner@firm.test',
    'manager@firm.test',
    '',
    'GSTR_1',
    '2025-04-01',
    '',
    'Fixed',
    '50000',
    '',
    '',
  ]);
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function parseEngagementImportSheet(rows: Record<string, unknown>[]): Omit<
  StagedEngagementRow,
  | 'clientAction'
  | 'matchedClientId'
  | 'matchedClientName'
  | 'partnerId'
  | 'managerId'
  | 'articleId'
  | 'engagementDupAction'
  | 'duplicateEngagementId'
  | 'duplicateEngagementTitle'
  | 'errors'
  | 'warnings'
>[] {
  return rows.map((raw, i) => ({
    rowIndex: i + 2, // 1-based sheet rows with header
    clientName: displayClientName(cellStr(raw.clientName ?? raw.ClientName ?? raw['Client Name'])),
    title: cellStr(raw.title ?? raw.Title ?? raw['Engagement Name']),
    type: cellStr(raw.type ?? raw.Type),
    financialYear: cellStr(raw.financialYear ?? raw.FinancialYear ?? raw['Financial Year']),
    partnerEmail: cellStr(raw.partnerEmail ?? raw.PartnerEmail ?? raw['Partner Email']).toLowerCase(),
    managerEmail: cellStr(raw.managerEmail ?? raw.ManagerEmail ?? raw['Manager Email']).toLowerCase(),
    articleEmail: cellStr(raw.articleEmail ?? raw.ArticleEmail ?? raw['Article Email']).toLowerCase() || undefined,
    serviceCode: cellStr(raw.serviceCode ?? raw.ServiceCode ?? raw['Service Code']) || undefined,
    startDate: cellStr(raw.startDate ?? raw.StartDate ?? raw['Start Date']) || undefined,
    deadline: cellStr(raw.deadline ?? raw.Deadline) || undefined,
    billingType: cellStr(raw.billingType ?? raw.BillingType ?? raw['Billing Type']) || undefined,
    billingAmount: parseAmount(raw.billingAmount ?? raw.BillingAmount ?? raw['Billing Amount']),
    scope: cellStr(raw.scope ?? raw.Scope) || undefined,
    notes: cellStr(raw.notes ?? raw.Notes) || undefined,
  }));
}

export async function rowsFromWorkbookBuffer(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = cellStr(cell.value);
  });
  const out: Record<string, unknown>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    let any = false;
    headers.forEach((h, idx) => {
      if (!h) return;
      const v = row.getCell(idx + 1).value;
      const s = cellStr(v);
      if (s) any = true;
      obj[h] = v;
    });
    if (any) out.push(obj);
  });
  return out;
}

export async function rowsFromCsvText(text: string): Promise<Record<string, unknown>[]> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? '';
    });
    return obj;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

type StaffUser = { id: string; email: string; role: string; firstName: string; lastName: string };

export async function stageEngagementImportRows(opts: {
  firmId: string;
  actorId: string;
  actorRole: string;
  rawRows: Record<string, unknown>[];
}): Promise<StagedEngagementRow[]> {
  const parsed = parseEngagementImportSheet(opts.rawRows);
  const clients = await prisma.client.findMany({
    where: { firmId: opts.firmId, archivedAt: null },
    select: { id: true, name: true },
  });
  const clientByKey = new Map(clients.map((c) => [normalizeClientNameKey(c.name), c]));

  const staff = await prisma.user.findMany({
    where: {
      firmId: opts.firmId,
      isActive: true,
      role: { in: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'] },
    },
    select: { id: true, email: true, role: true, firstName: true, lastName: true },
  });
  const byEmail = new Map(staff.map((u) => [u.email.trim().toLowerCase(), u]));

  const managerClientIds =
    opts.actorRole === 'Manager' ? await clientIdsAssignedToManager(opts.firmId, opts.actorId) : null;

  const engagementsByClient = new Map<string, { id: string; title: string }[]>();
  const engRows = await prisma.engagement.findMany({
    where: { firmId: opts.firmId, archivedAt: null },
    select: { id: true, title: true, clientId: true },
  });
  for (const e of engRows) {
    const list = engagementsByClient.get(e.clientId) ?? [];
    list.push({ id: e.id, title: e.title });
    engagementsByClient.set(e.clientId, list);
  }

  return parsed.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let clientAction: ClientAction = 'unresolved';
    let matchedClientId: string | null = null;
    let matchedClientName: string | null = null;

    if (!row.clientName) errors.push('Client name is required');
    if (!row.title) errors.push('Engagement title is required');
    if (!row.type || !(ENGAGEMENT_TYPES as readonly string[]).includes(row.type)) {
      errors.push(`Type must be one of: ${ENGAGEMENT_TYPES.join(', ')}`);
    }
    if (!row.financialYear) errors.push('Financial year is required');
    if (!row.partnerEmail) errors.push('Partner email is required');
    if (!row.managerEmail) errors.push('Manager email is required');

    const partner = row.partnerEmail ? byEmail.get(row.partnerEmail) : undefined;
    const manager = row.managerEmail ? byEmail.get(row.managerEmail) : undefined;
    const article = row.articleEmail ? byEmail.get(row.articleEmail) : undefined;

    if (row.partnerEmail && !partner) errors.push(`Partner not found: ${row.partnerEmail}`);
    else if (partner && !['Partner', 'Admin'].includes(partner.role)) {
      warnings.push(`Partner email maps to role ${partner.role}`);
    }
    if (row.managerEmail && !manager) errors.push(`Manager not found: ${row.managerEmail}`);
    else if (manager && !['Manager', 'Partner', 'Admin'].includes(manager.role)) {
      errors.push(`Manager email must be a Manager (or above): ${row.managerEmail}`);
    }
    if (row.articleEmail && !article) errors.push(`Article/staff not found: ${row.articleEmail}`);

    if (row.serviceCode && !SERVICE_CATALOG.some((s) => s.code === row.serviceCode)) {
      warnings.push(`Unknown serviceCode ${row.serviceCode}`);
    }

    if (row.clientName) {
      const match = clientByKey.get(normalizeClientNameKey(row.clientName));
      if (match) {
        matchedClientId = match.id;
        matchedClientName = match.name;
        clientAction = 'use_existing';
        if (
          !managerMayImportExistingClient({
            managerClientIds,
            clientId: match.id,
            actorId: opts.actorId,
            rowManagerId: manager?.id ?? null,
          })
        ) {
          errors.push('Manager may only import for assigned clients (or create a new client)');
        }
      } else {
        clientAction = 'create_new';
      }
    }

    let duplicateEngagementId: string | null = null;
    let duplicateEngagementTitle: string | null = null;
    let engagementDupAction: EngagementDupAction = 'unresolved';
    if (matchedClientId && row.title) {
      const dups = (engagementsByClient.get(matchedClientId) ?? []).filter(
        (e) => e.title.trim().toLowerCase() === row.title.trim().toLowerCase()
      );
      if (dups[0]) {
        duplicateEngagementId = dups[0].id;
        duplicateEngagementTitle = dups[0].title;
        engagementDupAction = 'unresolved';
        warnings.push(`Possible duplicate engagement under this client: ${dups[0].title}`);
      } else {
        engagementDupAction = 'create_anyway';
      }
    } else if (!matchedClientId) {
      engagementDupAction = 'create_anyway';
    }

    return {
      ...row,
      clientAction,
      matchedClientId,
      matchedClientName,
      partnerId: partner?.id ?? null,
      managerId: manager?.id ?? null,
      articleId: article?.id ?? null,
      engagementDupAction,
      duplicateEngagementId,
      duplicateEngagementTitle,
      errors,
      warnings,
    };
  });
}

/** Non-Manager actors skip the gate. Managers may use a client they already work on, or name themselves as row manager. */
export function managerMayImportExistingClient(opts: {
  managerClientIds: Set<string> | null;
  clientId: string;
  actorId: string;
  rowManagerId: string | null;
}): boolean {
  if (!opts.managerClientIds) return true;
  if (opts.managerClientIds.has(opts.clientId)) return true;
  if (opts.rowManagerId && opts.rowManagerId === opts.actorId) return true;
  return false;
}

async function clientIdsAssignedToManager(firmId: string, managerId: string): Promise<Set<string>> {
  const rows = await prisma.engagement.findMany({
    where: {
      firmId,
      archivedAt: null,
      OR: [
        { managerId },
        { partnerInChargeId: managerId },
        { members: { some: { userId: managerId } } },
      ],
    },
    select: { clientId: true },
  });
  return new Set(rows.map((r) => r.clientId));
}

export function rowReadyToImport(row: StagedEngagementRow): boolean {
  if (row.errors.length) return false;
  if (!row.partnerId || !row.managerId) return false;
  if (row.clientAction === 'unresolved') return false;
  if (row.clientAction === 'use_existing' && !row.matchedClientId) return false;
  if (row.engagementDupAction === 'unresolved') return false;
  if (row.engagementDupAction === 'skip') return false;
  return true;
}

export async function confirmEngagementImport(opts: {
  firmId: string;
  actorId: string;
  actorRole: string;
  rows: StagedEngagementRow[];
  ipAddress?: string | null;
}): Promise<{ created: number; clientsCreated: number; skipped: number; failed: { rowIndex: number; error: string }[] }> {
  const managerClientIds =
    opts.actorRole === 'Manager' ? await clientIdsAssignedToManager(opts.firmId, opts.actorId) : null;

  let created = 0;
  let clientsCreated = 0;
  let skipped = 0;
  const failed: { rowIndex: number; error: string }[] = [];

  for (const row of opts.rows) {
    if (row.engagementDupAction === 'skip') {
      skipped++;
      continue;
    }
    if (!rowReadyToImport(row)) {
      failed.push({
        rowIndex: row.rowIndex,
        error: row.errors[0] || 'Unresolved staging decisions',
      });
      continue;
    }

    try {
      let clientId = row.matchedClientId ?? null;
      if (row.clientAction === 'create_new') {
        const client = await prisma.client.create({
          data: {
            firmId: opts.firmId,
            name: displayClientName(row.clientName),
            status: 'Active',
            isActive: true,
            recordSource: 'ENGAGEMENT_IMPORT',
            createdById: opts.actorId,
            importedById: opts.actorId,
            importedAt: new Date(),
          },
        });
        clientId = client.id;
        clientsCreated++;
        await writeAuditLog({
          userId: opts.actorId,
          action: 'CREATE',
          entity: 'Client',
          entityId: client.id,
          details: { source: 'ENGAGEMENT_IMPORT', name: client.name },
          ipAddress: opts.ipAddress,
        });
      } else if (
        clientId &&
        !managerMayImportExistingClient({
          managerClientIds,
          clientId,
          actorId: opts.actorId,
          rowManagerId: row.managerId ?? null,
        })
      ) {
        failed.push({ rowIndex: row.rowIndex, error: 'Not assigned to this client' });
        continue;
      }

      if (!clientId) {
        failed.push({ rowIndex: row.rowIndex, error: 'Client missing' });
        continue;
      }

      // Re-check duplicate at confirm time
      if (row.engagementDupAction !== 'create_anyway') {
        const dup = await prisma.engagement.findFirst({
          where: {
            firmId: opts.firmId,
            clientId,
            archivedAt: null,
            title: { equals: row.title.trim() },
          },
          select: { id: true },
        });
        // MySQL collation may be case-insensitive already; also do exact filter in JS if needed
        if (dup) {
          failed.push({ rowIndex: row.rowIndex, error: 'Duplicate engagement — resolve in staging' });
          continue;
        }
      }

      let domain = inferDomainFromEngagementType(row.type);
      if (row.serviceCode) {
        const svc = SERVICE_CATALOG.find((s) => s.code === row.serviceCode);
        if (svc) domain = svc.domain;
      }
      const templateId = resolveTemplateId({
        workflowDomain: domain,
        serviceCode: row.serviceCode ?? null,
        type: row.type,
      });
      const firstStep = WORKFLOW_TEMPLATES[templateId].steps[0];
      const initialStage = templateId === 'AUDIT_STATUTORY' ? 'Data Pending' : firstStep.label;

      const engagement = await prisma.engagement.create({
        data: {
          title: row.title.trim(),
          type: row.type,
          financialYear: row.financialYear,
          clientId,
          firmId: opts.firmId,
          partnerInChargeId: row.partnerId!,
          managerId: row.managerId!,
          articleAssistantId: row.articleId ?? undefined,
          serviceCode: row.serviceCode ?? null,
          workflowDomain: domain,
          currentStage: initialStage,
          requestStatus: 'awaiting_letter_signature',
          letterStatus: 'draft',
          scope: row.scope,
          notes: row.notes,
          billingType: row.billingType || undefined,
          billingAmount: row.billingAmount,
          startDate: row.startDate ? new Date(row.startDate) : undefined,
          deadline: row.deadline ? new Date(row.deadline) : undefined,
          recordSource: 'ENGAGEMENT_IMPORT',
          createdById: opts.actorId,
          importedById: opts.actorId,
          importedAt: new Date(),
        },
      });

      await setEngagementTeam(
        engagement.id,
        [row.managerId!],
        row.articleId ? [row.articleId] : [],
        opts.actorId,
        row.partnerId!
      );

      if (row.serviceCode) {
        try {
          await generateDataChecklist(prisma, engagement.id, engagement.type, row.serviceCode);
        } catch (err) {
          logger.warn('Import checklist seed failed', { error: (err as Error).message });
        }
      }

      await writeAuditLog({
        userId: opts.actorId,
        action: 'CREATE',
        entity: 'Engagement',
        entityId: engagement.id,
        details: { source: 'ENGAGEMENT_IMPORT', title: engagement.title, clientId },
        ipAddress: opts.ipAddress,
      });
      created++;
    } catch (err) {
      failed.push({ rowIndex: row.rowIndex, error: (err as Error).message });
    }
  }

  return { created, clientsCreated, skipped, failed };
}

export type { StaffUser };
