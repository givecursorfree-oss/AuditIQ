const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/engagements': 'Engagements',
  '/engagements/workflow': 'Workflow of Engagements',
  '/workflow': 'Workflow Board',
  '/services': 'Service Catalog',
  '/requests': 'Client Requests',
  '/document-library': 'Letter Templates',
  '/admin/scheduler': 'Compliance Scheduler',
  '/clients': 'Clients',
  '/workpapers': 'Workpapers',
  '/documents': 'Documents',
  '/approvals': 'Approvals',
  '/time-tracker': 'Time & Billing',
  '/attendance': 'Attendance',
  '/leave-stipend': 'Leave & Stipend',
  '/employees': 'Employees',
  '/reports': 'Reports',
  '/billing': 'Billing',
  '/management-reports': 'Management Reports',
  '/vault': 'Password Vault',
  '/settings': 'Settings',
  '/messages': 'Messages',
  '/client/dashboard': 'Client Dashboard',
  '/client/messages': 'Messages',
  '/onboarding': 'Onboarding',
};

export function getRouteLabel(pathname: string): string {
  const path = pathname.replace(/\/$/, '') || '/';
  if (ROUTE_LABELS[path]) return ROUTE_LABELS[path];
  if (path.startsWith('/engagements/')) {
    if (path.endsWith('/letter')) return 'Engagement letter';
    return 'Engagement';
  }
  if (path.startsWith('/requests/')) return 'Client Request';
  if (path.startsWith('/client/')) return 'Client Portal';
  const base = '/' + path.split('/').filter(Boolean)[0];
  return ROUTE_LABELS[base] ?? 'Dashboard';
}
