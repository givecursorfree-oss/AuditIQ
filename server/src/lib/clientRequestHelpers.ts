import { SERVICE_CATALOG } from './workflowCatalog.js';

export function serviceLabel(code: string): string {
  return SERVICE_CATALOG.find((s) => s.code === code)?.name ?? code;
}

export function serviceMeta(code: string): { type: string; domain: string; code: string } {
  const svc = SERVICE_CATALOG.find((s) => s.code === code);
  if (!svc) return { type: 'Special', domain: 'DT', code };
  const type = svc.domain === 'IDT' ? 'GST' : svc.domain === 'AUDIT' ? 'Statutory' : 'Tax (44AB)';
  return { type, domain: svc.domain, code: svc.code };
}

export function recurringMeta(code: string): { isRecurring: boolean; recurringFrequency: string | null } {
  const isRecurring = ['GST_MONTHLY_RETURNS', 'GSTR_1', 'GSTR_3B', 'TDS_REMITTANCE', 'ADVANCE_TAX', 'TDS_QUARTERLY', 'TP_STUDY'].includes(
    code
  );
  let recurringFrequency: string | null = null;
  if (code === 'TP_STUDY') recurringFrequency = 'yearly';
  else if (['GST_MONTHLY_RETURNS', 'GSTR_1', 'GSTR_3B', 'TDS_REMITTANCE'].includes(code)) recurringFrequency = 'monthly';
  else if (['ADVANCE_TAX', 'TDS_QUARTERLY'].includes(code)) recurringFrequency = 'quarterly';
  return { isRecurring, recurringFrequency };
}

export function engagementTitleForService(
  code: string,
  clientName: string,
  financialYear: string
): string {
  return `${serviceLabel(code)} — ${clientName} — FY ${financialYear}`;
}

export function serviceLabels(codes: string[]): string {
  return codes.map(serviceLabel).join(', ');
}
