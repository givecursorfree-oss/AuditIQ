/**
 * Single source for statutory filing day-of-month hints used by dashboard,
 * recurring scheduler due-date fallback, and compliance calendar.
 * ponytail: month/quarter rules only — no QRMP/state variants yet.
 */

export type StatutoryDueRule = {
  serviceCode: string;
  dayOfMonth: number;
  label: string;
};

export const STATUTORY_DUE_RULES: StatutoryDueRule[] = [
  { serviceCode: 'TDS_REMITTANCE', dayOfMonth: 7, label: 'TDS remittance — 7th' },
  { serviceCode: 'GSTR_1', dayOfMonth: 11, label: 'GSTR-1 — 11th' },
  { serviceCode: 'GST_MONTHLY_RETURNS', dayOfMonth: 11, label: 'GSTR-1 — 11th' },
  { serviceCode: 'GSTR_3B', dayOfMonth: 20, label: 'GSTR-3B — 20th' },
  { serviceCode: 'SFT', dayOfMonth: 31, label: 'SFT — 31 May' },
  { serviceCode: 'FORM_10BD', dayOfMonth: 31, label: 'Form 10BD — 31 May' },
  { serviceCode: 'ITR_JULY', dayOfMonth: 31, label: 'ITR — 31 July' },
  { serviceCode: 'ITR_AUGUST', dayOfMonth: 31, label: 'ITR — 31 August' },
  { serviceCode: 'TAX_AUDIT_REPORT', dayOfMonth: 30, label: 'Tax audit report — 30 Sep' },
  { serviceCode: 'ITR_NON_TP', dayOfMonth: 31, label: 'ITR non-TP — 31 Oct' },
  { serviceCode: 'TP_BUNDLE', dayOfMonth: 30, label: 'TP bundle — 30 Nov' },
  { serviceCode: 'TP_STUDY', dayOfMonth: 31, label: 'TP study — 31 Dec' },
];

const byCode = new Map(STATUTORY_DUE_RULES.map((r) => [r.serviceCode, r]));

export function statutoryDueDayForService(serviceCode: string): number | null {
  return byCode.get(serviceCode)?.dayOfMonth ?? null;
}

/** Due date for a recurring period: use statutory day when known, else triggerDay + 7. */
export function computeRecurringDueDate(
  serviceCode: string,
  periodYear: number,
  periodMonth: number,
  triggerDay: number
): Date {
  const statutoryDay = statutoryDueDayForService(serviceCode);
  const day = statutoryDay ?? Math.min(triggerDay + 7, 28);
  const month = statutoryDay && serviceCode.startsWith('ITR') && serviceCode !== 'ITR_JULY' ? periodMonth : periodMonth;
  return new Date(Date.UTC(periodYear, month - 1, day));
}

export function dashboardStatutoryEntries(year: number, month: number) {
  return STATUTORY_DUE_RULES.filter((r) =>
    ['TDS_REMITTANCE', 'GSTR_1', 'GSTR_3B', 'ITR_JULY'].includes(r.serviceCode)
  ).map((r) => ({
    serviceCode: r.serviceCode,
    title: r.label,
    dueDate: new Date(Date.UTC(year, month - 1, r.dayOfMonth)).toISOString().slice(0, 10),
  }));
}
