/** Header chrome labels — keep in sync with navCatalog paths. */
const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/engagements': 'Engagements',
  '/engagements/portfolio': 'Portfolio View',
  '/engagements/workflow': 'Engagements',
  '/workflow': 'Engagements',
  '/services': 'Service Catalog',
  '/compliance-calendar': 'Compliance Calendar',
  '/requests': 'Client Requests',
  '/document-library': 'Letter Templates',
  '/admin/scheduler': 'Compliance Scheduler',
  '/clients': 'Clients',
  '/workpapers': 'Workpapers',
  '/documents': 'Document Library',
  '/approvals': 'Approvals',
  '/time-tracker': 'Time tracker',
  '/timesheets': 'Timesheets',
  '/attendance': 'Attendance',
  '/leave-stipend': 'Leave & Stipend',
  '/employees': 'Employees',
  '/claims': 'Claims',
  '/claims/pending': 'Attendance claims',
  '/claims/batches': 'Claim Batches',
  '/reports': 'Reports',
  '/billing': 'Billing & Invoices',
  '/billing/pending': 'Pending Billing',
  '/notices': 'Notices',
  '/management-reports': 'Management Reports',
  '/vault': 'Password Vault',
  '/settings': 'Settings',
  '/messages': 'Messages',
  '/client/dashboard': 'My Dashboard',
  '/client/messages': 'Messages',
  '/unauthorized': 'Unauthorized',
};

export function getRouteLabel(pathname: string): string {
  const path = pathname.replace(/\/$/, '') || '/';
  if (ROUTE_LABELS[path]) return ROUTE_LABELS[path];
  if (path.startsWith('/claims/new/')) return 'New claim';
  if (path.startsWith('/claims/')) return 'Claims';
  if (path.startsWith('/notices/')) return 'Notice';
  if (path.startsWith('/staff/') && path.endsWith('/schedule')) return 'Staff schedule';
  if (path.startsWith('/engagements/')) {
    if (path.endsWith('/letter')) return 'Engagement letter';
    return 'Engagement';
  }
  if (path.startsWith('/requests/')) return 'Client Request';
  if (path.startsWith('/client/')) return 'Client Portal';
  const base = '/' + path.split('/').filter(Boolean)[0];
  return ROUTE_LABELS[base] ?? 'Dashboard';
}
