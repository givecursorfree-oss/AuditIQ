/**
 * Substitutes {{VARIABLE}} placeholders in document templates.
 */

export type TemplateVariables = Record<string, string | number | undefined | null>;

const VAR_PATTERN = /\{\{([A-Z0-9_]+)\}\}/g;

export function extractTemplateVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(VAR_PATTERN)) {
    found.add(match[1]);
  }
  return Array.from(found);
}

export function renderTemplate(text: string, vars: TemplateVariables): string {
  return text.replace(VAR_PATTERN, (_full, key: string) => {
    const val = vars[key];
    if (val == null || val === '') return '';
    return String(val);
  });
}

/** Collapse empty placeholders that left " —  — " (double em dash) in subjects. */
export function tidyRenderedSubject(subject: string): string {
  return subject
    .replace(/\s*—(?:\s*—)+/g, ' —')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** First day of the calendar month before `d` (IST-agnostic local Date). */
export function previousCalendarMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** GST returns for month M are typically filed in M+1 — data request uses previous month. */
export function isGstDataRequestCategory(category: string): boolean {
  return category === 'gstr_monthly_letter' || category.startsWith('gstr_');
}

export function buildDefaultTemplateVars(input: {
  client?: { name?: string; pan?: string | null; gstin?: string | null; address?: string | null };
  firm?: { name?: string };
  partnerName?: string;
  financialYear?: string;
  financialYears?: string[];
  serviceDescription?: string;
  engagementType?: string;
  deadlineDate?: string;
  date?: Date;
  /** Explicit period the letter is about */
  periodDate?: Date;
  /** When true, MONTH / MONTH_YEAR are previous calendar month vs `date` */
  usePreviousMonth?: boolean;
}): TemplateVariables {
  const today = input.date ?? new Date();
  const dateStr = today.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const fy =
    input.financialYear ||
    (input.financialYears?.length ? input.financialYears.join(', ') : '');

  const period =
    input.periodDate ??
    (input.usePreviousMonth ? previousCalendarMonth(today) : today);

  return {
    CLIENT_NAME: input.client?.name ?? '',
    CLIENT_PAN: input.client?.pan ?? '',
    CLIENT_GSTIN: input.client?.gstin ?? '',
    CLIENT_ADDRESS: input.client?.address ?? '',
    FIRM_NAME: input.firm?.name ?? 'M.K. Dandeker & Co LLP',
    PARTNER_NAME: input.partnerName ?? '',
    DATE: dateStr,
    FINANCIAL_YEAR: fy,
    FINANCIAL_YEARS: fy,
    ENGAGEMENT_TYPE: input.engagementType ?? '',
    SERVICE_DESCRIPTION: input.serviceDescription ?? input.engagementType ?? '',
    DEADLINE_DATE: input.deadlineDate ?? '',
    FEE_AMOUNT: '',
    REFERENCE_NUMBER: '',
    MONTH: period.toLocaleDateString('en-IN', { month: 'long' }),
    MONTH_YEAR: formatMonthYear(period),
    DATA_DEADLINE_DATE: input.deadlineDate ?? '',
    INSTALLMENT: '',
    NOTICE_TYPE: '',
    AUTHORITY: 'GST / Income Tax Department',
    SCOPE_OF_SERVICES: '',
    SCOPE_AND_PROCESS: '',
    FEE_TABLE: '',
  };
}

export function formatFeeTable(
  fees: { particular: string; amount: string }[]
): string {
  if (!fees.length) {
    return `Particulars\nFee (Per Financial year)\n\nAs mutually agreed.`;
  }
  const rows = fees.map((f) => `${f.particular}\n${f.amount}`).join('\n\n');
  return `Particulars\nFee (Per Financial year)\n\n${rows}`;
}
