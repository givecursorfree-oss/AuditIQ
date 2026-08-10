export type NavBadgeKey =

  | 'notifications'

  | 'approvals'

  | 'messages'

  | 'unassignedEngagements'

  | 'incomingClients'

  | 'openClientQueries'

  | 'pendingDocuments'

  | 'pendingLeaves'

  | 'dashboardAttention'

  | 'clientAttention'

  | 'clientPendingDocuments'

  | 'clientPendingActivation'

  | 'clientOpenQueries'

  | 'clientPendingLetters'

  | 'pendingClientRequests'

  | 'lettersNeedingTeam'

  | 'workflowAttention';



export type NavBadges = Record<NavBadgeKey, number>;



export const EMPTY_NAV_BADGES: NavBadges = {

  notifications: 0,

  approvals: 0,

  messages: 0,

  unassignedEngagements: 0,

  incomingClients: 0,

  openClientQueries: 0,

  pendingDocuments: 0,

  pendingLeaves: 0,

  dashboardAttention: 0,

  clientAttention: 0,

  clientPendingDocuments: 0,

  clientPendingActivation: 0,

  clientOpenQueries: 0,

  clientPendingLetters: 0,

  pendingClientRequests: 0,

  lettersNeedingTeam: 0,

  workflowAttention: 0,

};



/** Maps sidebar nav catalog ids to badge count keys */

const NAV_ID_TO_BADGE_KEY: Partial<Record<string, NavBadgeKey>> = {

  dashboard: 'dashboardAttention',

  engagements: 'workflowAttention',

  clients: 'incomingClients',

  requests: 'pendingClientRequests',

  documents: 'pendingDocuments',

  approvals: 'approvals',

  messages: 'messages',

  'leave-manage': 'pendingLeaves',

  'client-dashboard': 'clientAttention',

  'client-messages': 'messages',

};



export const CHROME_NOTIFICATIONS_BADGE_KEY: NavBadgeKey = 'notifications';



export function badgeForNavId(badges: NavBadges, navId: string): number {

  const key = NAV_ID_TO_BADGE_KEY[navId];

  return key ? badges[key] ?? 0 : 0;

}



export type NavAttentionScope =

  | 'dashboard'

  | 'requests'

  | 'workflow'

  | 'clients'

  | 'documents'

  | 'queries'

  | 'letters'

  | 'notifications'

  | 'client-portal';



/** Route prefixes → scopes acknowledged when the user opens that page */

export function scopesForPath(pathname: string): NavAttentionScope[] {

  if (pathname === '/' || pathname === '') return ['dashboard'];

  if (pathname.startsWith('/client/dashboard') || pathname === '/portal') return ['client-portal'];

  if (pathname.startsWith('/requests')) return ['requests', 'dashboard'];

  if (pathname.includes('/letter')) return ['letters', 'workflow'];

  if (pathname.startsWith('/engagements')) return ['workflow'];

  if (pathname.startsWith('/clients')) return ['clients'];

  if (pathname.startsWith('/documents')) return ['documents'];

  if (pathname.includes('tab=queries')) return ['queries'];

  return [];

}


