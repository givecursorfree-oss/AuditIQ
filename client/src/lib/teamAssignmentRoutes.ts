/** Deep link to Clients → Incoming → assign panel for a specific engagement. */
export function teamAssignmentPath(engagementId: string): string {
  const params = new URLSearchParams({
    tab: 'incoming',
    engagementId,
  });
  return `/clients?${params.toString()}`;
}
