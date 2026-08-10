/** Matches server-side report-originated audit queries (also stored on Report.clientQueryText). */
export function isReportDerivedQuery(subject: string): boolean {
  return subject.startsWith('Query on report:');
}
