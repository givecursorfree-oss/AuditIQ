/** Engagement hub tabs — workflow is always visible on the page; deep links scroll there. */
export type EngagementHubTab =
  | 'overview'
  | 'workflow'
  | 'documents'
  | 'queries'
  | 'el'
  | 'timelog';

export function engagementHubPath(
  engagementId: string,
  tab: EngagementHubTab = 'documents'
): string {
  if (tab === 'overview' || tab === 'workflow') {
    return tab === 'workflow'
      ? `/engagements/${engagementId}?tab=workflow`
      : `/engagements/${engagementId}`;
  }
  return `/engagements/${engagementId}?tab=${tab}`;
}

/** Tasks are shown inside the Workflow & tasks tab. */
export function engagementTasksPath(engagementId: string): string {
  return engagementHubPath(engagementId, 'workflow');
}
