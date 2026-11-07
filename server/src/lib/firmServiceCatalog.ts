import type { FirmService, PrismaClient } from '@prisma/client';
import { canArchiveRecords } from './clientEngagementArchive.js';
import { writeAuditLog } from './writeAuditLog.js';
import {
  SERVICE_CATALOG,
  type ServiceCatalogItem,
  type TemplateId,
  type WorkflowDomain,
} from './workflowCatalog.js';

const TEMPLATE_IDS = new Set(['DT_COMPLIANCE', 'IDT_GST_RETURN', 'AUDIT_STATUTORY']);
const DOMAINS = new Set(['DT', 'IDT', 'AUDIT']);
const RECURRENCES = new Set(['monthly', 'quarterly', 'annual', 'ad_hoc']);

export type FirmServiceInput = {
  code: string;
  domain: WorkflowDomain;
  name: string;
  dueRule?: string | null;
  recurrence?: string | null;
  templateId: TemplateId;
  sortOrder?: number;
};

export function normalizeServiceCodeInput(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function validateFirmServiceInput(
  input: Partial<FirmServiceInput> & { code?: string; name?: string }
): { ok: true; data: FirmServiceInput } | { ok: false; error: string } {
  const code = normalizeServiceCodeInput(input.code ?? '');
  if (!code) return { ok: false, error: 'Service code is required' };
  const name = (input.name ?? '').trim();
  if (!name) return { ok: false, error: 'Service name is required' };
  if (!input.domain || !DOMAINS.has(input.domain)) {
    return { ok: false, error: 'Domain must be DT, IDT, or AUDIT' };
  }
  if (!input.templateId || !TEMPLATE_IDS.has(input.templateId)) {
    return { ok: false, error: 'Workflow template is required' };
  }
  const recurrence = input.recurrence?.trim() || null;
  if (recurrence && !RECURRENCES.has(recurrence)) {
    return { ok: false, error: 'Invalid recurrence' };
  }
  return {
    ok: true,
    data: {
      code,
      domain: input.domain,
      name,
      dueRule: input.dueRule?.trim() || null,
      recurrence,
      templateId: input.templateId as TemplateId,
      sortOrder: input.sortOrder ?? 0,
    },
  };
}

function seedRow(item: ServiceCatalogItem, index: number) {
  return {
    code: item.code,
    domain: item.domain,
    name: item.name,
    dueRule: item.dueRule ?? null,
    recurrence: item.recurrence ?? null,
    templateId: item.templateId,
    sortOrder: index,
    isSystem: true,
  };
}

/** Seed MKD defaults once per firm (idempotent). */
export async function ensureFirmServicesSeeded(
  prisma: PrismaClient,
  firmId: string,
  createdById?: string | null
): Promise<void> {
  const count = await prisma.firmService.count({ where: { firmId } });
  if (count > 0) return;

  await prisma.firmService.createMany({
    data: SERVICE_CATALOG.map((item, i) => ({
      ...seedRow(item, i),
      firmId,
      createdById: createdById ?? null,
    })),
  });
}

export type ListFirmServicesOpts = {
  includeArchived?: boolean;
  archivedOnly?: boolean;
};

export async function listFirmServices(
  prisma: PrismaClient,
  firmId: string,
  opts: ListFirmServicesOpts = {},
  createdById?: string | null
): Promise<FirmService[]> {
  await ensureFirmServicesSeeded(prisma, firmId, createdById);

  const where: { firmId: string; archivedAt?: null | { not: null } } = { firmId };
  if (opts.archivedOnly) where.archivedAt = { not: null };
  else if (!opts.includeArchived) where.archivedAt = null;

  return prisma.firmService.findMany({
    where,
    orderBy: [{ domain: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getFirmServiceByCode(
  prisma: PrismaClient,
  firmId: string,
  code: string,
  opts: { includeArchived?: boolean } = {}
): Promise<FirmService | null> {
  await ensureFirmServicesSeeded(prisma, firmId);
  const normalized = normalizeServiceCodeInput(code);
  return prisma.firmService.findFirst({
    where: {
      firmId,
      code: normalized,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
    },
  });
}

/** Resolve catalog meta for engagement create / import (active firm row, else static seed). */
export async function resolveServiceMeta(
  prisma: PrismaClient,
  firmId: string | null | undefined,
  code: string | null | undefined
): Promise<ServiceCatalogItem | null> {
  if (!code) return null;
  const normalized = normalizeServiceCodeInput(code);
  if (firmId) {
    const row = await getFirmServiceByCode(prisma, firmId, normalized, { includeArchived: true });
    if (row && !row.archivedAt) {
      return {
        code: row.code,
        domain: row.domain as WorkflowDomain,
        name: row.name,
        dueRule: row.dueRule ?? undefined,
        recurrence: (row.recurrence as ServiceCatalogItem['recurrence']) ?? undefined,
        templateId: row.templateId,
      };
    }
  }
  return SERVICE_CATALOG.find((s) => s.code === normalized) ?? null;
}

export async function createFirmService(opts: {
  prisma: PrismaClient;
  firmId: string;
  actorId: string;
  input: FirmServiceInput;
}): Promise<{ ok: true; service: FirmService } | { ok: false; error: string; status: number }> {
  await ensureFirmServicesSeeded(opts.prisma, opts.firmId, opts.actorId);
  const existing = await opts.prisma.firmService.findFirst({
    where: { firmId: opts.firmId, code: opts.input.code },
  });
  if (existing) {
    if (existing.archivedAt) {
      return { ok: false, error: 'A service with this code is archived — restore it instead', status: 409 };
    }
    return { ok: false, error: 'Service code already exists', status: 409 };
  }

  const maxSort = await opts.prisma.firmService.aggregate({
    where: { firmId: opts.firmId, domain: opts.input.domain },
    _max: { sortOrder: true },
  });

  const service = await opts.prisma.firmService.create({
    data: {
      firmId: opts.firmId,
      createdById: opts.actorId,
      code: opts.input.code,
      domain: opts.input.domain,
      name: opts.input.name,
      dueRule: opts.input.dueRule,
      recurrence: opts.input.recurrence,
      templateId: opts.input.templateId,
      sortOrder: opts.input.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
      isSystem: false,
    },
  });
  await writeAuditLog({
    userId: opts.actorId,
    action: 'CREATE',
    entity: 'FirmService',
    entityId: service.id,
    details: { code: service.code, name: service.name },
  });
  return { ok: true, service };
}

export async function updateFirmService(opts: {
  prisma: PrismaClient;
  firmId: string;
  actorId: string;
  code: string;
  patch: Partial<FirmServiceInput>;
}): Promise<{ ok: true; service: FirmService } | { ok: false; error: string; status: number }> {
  const row = await getFirmServiceByCode(opts.prisma, opts.firmId, opts.code, { includeArchived: true });
  if (!row) return { ok: false, error: 'Service not found', status: 404 };
  if (row.archivedAt) return { ok: false, error: 'Restore the service before editing', status: 400 };

  const nextName = opts.patch.name !== undefined ? opts.patch.name.trim() : row.name;
  if (!nextName) return { ok: false, error: 'Service name is required', status: 400 };

  const nextDomain = (opts.patch.domain ?? row.domain) as WorkflowDomain;
  if (!DOMAINS.has(nextDomain)) return { ok: false, error: 'Invalid domain', status: 400 };

  const nextTemplate = (opts.patch.templateId ?? row.templateId) as TemplateId;
  if (!TEMPLATE_IDS.has(nextTemplate)) return { ok: false, error: 'Invalid workflow template', status: 400 };

  const nextRecurrence =
    opts.patch.recurrence !== undefined ? opts.patch.recurrence?.trim() || null : row.recurrence;
  if (nextRecurrence && !RECURRENCES.has(nextRecurrence)) {
    return { ok: false, error: 'Invalid recurrence', status: 400 };
  }

  const service = await opts.prisma.firmService.update({
    where: { id: row.id },
    data: {
      name: nextName,
      domain: nextDomain,
      dueRule: opts.patch.dueRule !== undefined ? opts.patch.dueRule?.trim() || null : row.dueRule,
      recurrence: nextRecurrence,
      templateId: nextTemplate,
      ...(opts.patch.sortOrder !== undefined ? { sortOrder: opts.patch.sortOrder } : {}),
    },
  });
  await writeAuditLog({
    userId: opts.actorId,
    action: 'UPDATE',
    entity: 'FirmService',
    entityId: service.id,
    details: { code: service.code, name: service.name },
  });
  return { ok: true, service };
}

export async function archiveFirmService(opts: {
  prisma: PrismaClient;
  firmId: string;
  actorId: string;
  actorRole: string;
  code: string;
  ipAddress?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!canArchiveRecords(opts.actorRole)) {
    return { ok: false, error: 'Not allowed to archive services', status: 403 };
  }
  const row = await getFirmServiceByCode(opts.prisma, opts.firmId, opts.code, { includeArchived: true });
  if (!row) return { ok: false, error: 'Service not found', status: 404 };
  if (row.archivedAt) return { ok: false, error: 'Already archived', status: 400 };

  await opts.prisma.firmService.update({
    where: { id: row.id },
    data: {
      archivedAt: new Date(),
      archivedById: opts.actorId,
      restoredAt: null,
      restoredById: null,
    },
  });
  await writeAuditLog({
    userId: opts.actorId,
    action: 'ARCHIVE',
    entity: 'FirmService',
    entityId: row.id,
    details: { code: row.code, name: row.name },
    ipAddress: opts.ipAddress,
  });
  return { ok: true };
}

export async function restoreFirmService(opts: {
  prisma: PrismaClient;
  firmId: string;
  actorId: string;
  actorRole: string;
  code: string;
  ipAddress?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!canArchiveRecords(opts.actorRole)) {
    return { ok: false, error: 'Not allowed to restore services', status: 403 };
  }
  const row = await getFirmServiceByCode(opts.prisma, opts.firmId, opts.code, { includeArchived: true });
  if (!row) return { ok: false, error: 'Service not found', status: 404 };
  if (!row.archivedAt) return { ok: false, error: 'Not archived', status: 400 };

  await opts.prisma.firmService.update({
    where: { id: row.id },
    data: {
      archivedAt: null,
      archivedById: null,
      restoredAt: new Date(),
      restoredById: opts.actorId,
    },
  });
  await writeAuditLog({
    userId: opts.actorId,
    action: 'RESTORE',
    entity: 'FirmService',
    entityId: row.id,
    details: { code: row.code, name: row.name },
    ipAddress: opts.ipAddress,
  });
  return { ok: true };
}

/** Find (or create stub) data-request template covering this service code. */
export async function findOrCreateDataRequestTemplate(
  prisma: PrismaClient,
  firmId: string,
  serviceCode: string,
  serviceName: string,
  actorId?: string | null
) {
  const { seedDocumentTemplates } = await import('./documentTemplateSeed.js');
  await seedDocumentTemplates(prisma, firmId, actorId ?? undefined);

  const templates = await prisma.documentTemplate.findMany({
    where: { firmId, isActive: true },
  });
  const code = normalizeServiceCodeInput(serviceCode);
  const match = templates.find((t) => {
    const types = Array.isArray(t.serviceTypes) ? (t.serviceTypes as string[]) : [];
    return types.includes(code);
  });
  if (match) return match;

  const { extractTemplateVariables } = await import('./templateRenderer.js');
  const subject = `Data required — ${serviceName} — {{MONTH_YEAR}}`;
  const body = `Dear {{CLIENT_NAME}},

Kindly share the data required for ${serviceName} ({{MONTH_YEAR}}) at the earliest.

Please share by {{DATA_DEADLINE_DATE}}.

For {{FIRM_NAME}}`;
  const variables = [
    ...new Set([...extractTemplateVariables(subject), ...extractTemplateVariables(body)]),
  ];
  return prisma.documentTemplate.create({
    data: {
      firmId,
      createdById: actorId ?? null,
      name: `${serviceName} data request`,
      category: 'data_request',
      serviceTypes: [code],
      subject,
      body,
      variables,
    },
  });
}
