/** Keep in sync with server/src/lib/dataRequestMail.ts DATA_REQUEST_CATEGORIES */
const DATA_REQUEST_CATEGORIES = new Set([
  'data_request',
  'gstr_monthly_letter',
  'advance_tax_request',
  'tds_monthly_letter',
  'tp_study_request',
  'it_notice_request',
  'notice_communication',
]);

export function isDataRequestCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return DATA_REQUEST_CATEGORIES.has(category.trim().toLowerCase());
}
