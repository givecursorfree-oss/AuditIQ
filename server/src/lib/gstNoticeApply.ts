import prisma from './prisma.js';
import {
  parseGstNoticeWorkbook,
  portalFieldChanged,
  type ParsedGstNoticeRow,
} from './gstNoticeImport.js';

export type GstNoticeImportResult = {
  gstin: string | null;
  gstinValid: boolean | null;
  gstinMatchedClient: boolean;
  sheetName: string | null;
  partial: boolean;
  rowsRead: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: { rowIndex: number; reason: string }[];
};

function meaningfulPortalChange(
  existing: {
    portalType: string | null;
    portalDescription: string | null;
    portalIssueDate: Date | null;
    portalDueDate: Date | null;
    portalDueKind: string;
    portalPeriod: string | null;
  },
  row: ParsedGstNoticeRow
): { changed: boolean; clearOverrides: string[] } {
  const clear: string[] = [];
  let changed = false;
  if (portalFieldChanged(existing.portalType, row.type)) {
    changed = true;
    clear.push('overrideType');
  }
  if (portalFieldChanged(existing.portalDescription, row.description)) {
    changed = true;
    clear.push('overrideDescription');
  }
  if (portalFieldChanged(existing.portalIssueDate, row.issueDate)) {
    changed = true;
    clear.push('overrideIssueDate');
  }
  if (
    portalFieldChanged(existing.portalDueDate, row.dueDate) ||
    (row.dueKind && existing.portalDueKind !== row.dueKind && row.dueKind !== 'unclear')
  ) {
    // Due kind/date change from a real source value
    if (row.dueKind !== 'unclear' || row.dueDate) {
      changed = true;
      clear.push('overrideDueDate', 'overrideDueKind');
    }
  }
  if (portalFieldChanged(existing.portalPeriod, row.period)) {
    changed = true;
    clear.push('overridePeriod');
  }
  return { changed, clearOverrides: clear };
}

export async function importGstNoticesForClient(opts: {
  firmId: string;
  clientId: string;
  buffer: Buffer;
  expectGstin?: string | null;
}): Promise<GstNoticeImportResult> {
  const client = await prisma.client.findFirst({
    where: { id: opts.clientId, firmId: opts.firmId, archivedAt: null },
    select: { id: true, gstin: true },
  });
  if (!client) {
    return {
      gstin: null,
      gstinValid: null,
      gstinMatchedClient: false,
      sheetName: null,
      partial: true,
      rowsRead: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: [{ rowIndex: 0, reason: 'Client not found' }],
    };
  }

  const parsed = await parseGstNoticeWorkbook(opts.buffer);
  const skipped = [...parsed.skipped];

  let gstinValid: boolean | null = null;
  let gstinMatchedClient = true;
  if (parsed.gstinSource === 'Basic!A2') {
    gstinValid = Boolean(parsed.gstin);
    if (!parsed.gstin) {
      skipped.push({ rowIndex: 0, reason: 'Basic!A2 GSTIN is missing or invalid' });
      return {
        gstin: null,
        gstinValid: false,
        gstinMatchedClient: false,
        sheetName: parsed.sheetName,
        partial: true,
        rowsRead: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        skipped,
      };
    }
    const clientGstin = (client.gstin || '').replace(/\s+/g, '').toUpperCase();
    if (clientGstin && clientGstin !== parsed.gstin) {
      gstinMatchedClient = false;
      skipped.push({
        rowIndex: 0,
        reason: `Workbook GSTIN ${parsed.gstin} does not match client GSTIN ${clientGstin}`,
      });
      return {
        gstin: parsed.gstin,
        gstinValid: true,
        gstinMatchedClient: false,
        sheetName: parsed.sheetName,
        partial: true,
        rowsRead: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        skipped,
      };
    }
    if (!clientGstin) {
      await prisma.client.update({
        where: { id: client.id },
        data: { gstin: parsed.gstin },
      });
    }
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const now = new Date();

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const existing = await prisma.clientGstNotice.findUnique({
      where: {
        clientId_noticeOrderId: { clientId: client.id, noticeOrderId: row.noticeOrderId },
      },
    });

    if (!existing) {
      await prisma.clientGstNotice.create({
        data: {
          firmId: opts.firmId,
          clientId: client.id,
          noticeOrderId: row.noticeOrderId,
          importOrder: i,
          portalType: row.type,
          portalDescription: row.description,
          portalIssueDate: row.issueDate,
          portalDueDate: row.dueDate,
          portalDueKind: row.dueKind,
          portalPeriod: row.period,
          portalSourceStatus: row.sourceStatus,
          portalAssignedTo: row.assignedTo,
          assignedTo: row.assignedTo,
          viewState: 'New',
          lastImportedAt: now,
        },
      });
      created++;
      continue;
    }

    const { changed, clearOverrides } = meaningfulPortalChange(existing, row);
    if (!changed) {
      await prisma.clientGstNotice.update({
        where: { id: existing.id },
        data: { importOrder: i, lastImportedAt: now },
      });
      unchanged++;
      continue;
    }

    const data: Record<string, unknown> = {
      importOrder: i,
      lastImportedAt: now,
      version: { increment: 1 },
    };
    if (row.type) data.portalType = row.type;
    if (row.description) data.portalDescription = row.description;
    if (row.issueDate) data.portalIssueDate = row.issueDate;
    if (row.dueKind !== 'unclear' || row.dueDate) {
      data.portalDueKind = row.dueKind;
      data.portalDueDate = row.dueDate;
    }
    if (row.period) data.portalPeriod = row.period;
    for (const key of clearOverrides) data[key] = null;
    if (existing.viewState === 'Seen') data.viewState = 'Updated';
    // New stays New; Status/Assigned To from source never overwrite after first import

    await prisma.clientGstNotice.update({ where: { id: existing.id }, data });
    updated++;
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      gstNoticeLastImportAt: now,
      gstNoticeDataComplete: !parsed.partial && gstinValid !== false,
    },
  });

  return {
    gstin: parsed.gstin,
    gstinValid,
    gstinMatchedClient,
    sheetName: parsed.sheetName,
    partial: parsed.partial,
    rowsRead: parsed.rows.length,
    created,
    updated,
    unchanged,
    skipped,
  };
}
