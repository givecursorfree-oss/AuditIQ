/**
 * Single source of truth for sidebar navigation and route access.
 * Visibility = role gate (roles[]) AND permission (module:action) from Settings → Roles.
 */

export interface NavPermission {
  module: string;
  action?: string;
}

export interface NavCatalogItem {
  id: string;
  path: string;
  label: string;
  group: string;
  roles?: string[];
  permission?: NavPermission;
  hierarchyExclude?: boolean;
  tab?: string;
  /** Route stays valid; item is omitted from the sidebar (linked from a hub page instead). */
  sidebarHidden?: boolean;
}

export const NAV_GROUPS_ORDER = [
  'Main',
  'Clients',
  'Audit Work',
  'Team',
  'Insights',
  'Administration',
  'Client Portal',
] as const;

export const NAV_CATALOG: NavCatalogItem[] = [
  { id: 'dashboard', path: '/', label: 'Dashboard', group: 'Main', permission: { module: 'dashboard', action: 'view' } },
  { id: 'compliance-calendar', path: '/compliance-calendar', label: 'Compliance Calendar', group: 'Main', roles: ['Partner', 'Admin', 'Manager'], permission: { module: 'engagements', action: 'view' }, sidebarHidden: true },
  { id: 'services', path: '/services', label: 'Service Catalog', group: 'Main', roles: ['Partner', 'Admin', 'Manager', 'Staff'], hierarchyExclude: true, permission: { module: 'engagements', action: 'view' }, sidebarHidden: true },
  { id: 'engagements', path: '/engagements', label: 'Engagements', group: 'Main', roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'], permission: { module: 'engagements', action: 'view' } },
  { id: 'engagement-portfolio', path: '/engagements/portfolio', label: 'Portfolio View', group: 'Main', roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'], permission: { module: 'engagements', action: 'view' } },

  { id: 'requests', path: '/requests', label: 'Client Requests', group: 'Clients', roles: ['Partner', 'Admin', 'Manager'], permission: { module: 'clients', action: 'view' } },
  { id: 'doc-templates', path: '/document-library', label: 'Letter Templates', group: 'Audit Work', roles: ['Partner', 'Admin', 'Manager'], permission: { module: 'documents', action: 'view' }, sidebarHidden: true },
  { id: 'scheduler', path: '/admin/scheduler', label: 'Compliance Scheduler', group: 'Administration', roles: ['Partner', 'Admin'], permission: { module: 'settings', action: 'view' } },

  { id: 'clients', path: '/clients', label: 'Client List', group: 'Clients', roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'], permission: { module: 'clients', action: 'view' } },

  { id: 'workpapers', path: '/workpapers', label: 'Workpapers', group: 'Audit Work', roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'], permission: { module: 'workpapers', action: 'view' } },
  { id: 'documents', path: '/documents', label: 'Document Library', group: 'Audit Work', permission: { module: 'documents', action: 'view' } },
  { id: 'approvals', path: '/approvals', label: 'Approvals', group: 'Audit Work', roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'], permission: { module: 'approvals', action: 'view' } },

  { id: 'time-tracker', path: '/time-tracker', label: 'Time & Billing', group: 'Team', roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern', 'Accounts'], permission: { module: 'attendance', action: 'view' } },
  { id: 'timesheets', path: '/timesheets', label: 'Timesheets', group: 'Team', roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'], permission: { module: 'attendance', action: 'view' }, sidebarHidden: true },
  { id: 'claims-pending', path: '/claims/pending', label: 'Claim Approvals', group: 'Team', roles: ['Partner', 'Admin', 'Manager'], permission: { module: 'approvals', action: 'view' }, sidebarHidden: true },
  { id: 'attendance', path: '/attendance', label: 'Attendance', group: 'Team', roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern', 'HR'], permission: { module: 'attendance', action: 'view' } },
  { id: 'leave-apply', path: '/leave-stipend', label: 'Apply Leave', group: 'Team', tab: 'apply', roles: ['Partner', 'Manager', 'Staff', 'Intern', 'HR'], permission: { module: 'leave', action: 'apply' } },
  { id: 'leave-manage', path: '/leave-stipend', label: 'Leave Management', group: 'Team', tab: 'inbox', roles: ['Partner', 'Admin', 'Manager', 'HR'], permission: { module: 'leave', action: 'manage' } },
  { id: 'stipend', path: '/leave-stipend', label: 'Stipend', group: 'Team', tab: 'stipend', roles: ['Intern'], permission: { module: 'leave', action: 'apply' } },
  { id: 'employees', path: '/employees', label: 'Employees', group: 'Team', roles: ['Partner', 'Admin', 'Manager', 'Staff', 'HR'], hierarchyExclude: true, permission: { module: 'employees', action: 'view' } },
  { id: 'messages', path: '/messages', label: 'Messages', group: 'Team', roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern', 'HR'], permission: { module: 'messages', action: 'view' } },

  { id: 'reports', path: '/reports', label: 'Reports', group: 'Insights', roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'], permission: { module: 'reports', action: 'view' } },
  { id: 'billing', path: '/billing', label: 'Billing & Invoices', group: 'Insights', roles: ['Partner', 'Admin', 'Manager', 'Accounts'], permission: { module: 'invoices', action: 'view' } },
  { id: 'billing-pending', path: '/billing/pending', label: 'Pending Billing', group: 'Insights', roles: ['Partner', 'Admin', 'Manager', 'Accounts'], permission: { module: 'invoices', action: 'view' }, sidebarHidden: true },
  { id: 'notices', path: '/notices', label: 'Notices', group: 'Insights', roles: ['Partner', 'Admin', 'Manager'], permission: { module: 'reports', action: 'view' } },
  { id: 'management-reports', path: '/management-reports', label: 'Management Reports', group: 'Insights', roles: ['Partner', 'Admin'], permission: { module: 'reports', action: 'export' } },
  { id: 'vault', path: '/vault', label: 'Password Vault', group: 'Insights', roles: ['Partner', 'Admin', 'Manager'], permission: { module: 'vault', action: 'view' } },

  { id: 'settings', path: '/settings', label: 'Settings', group: 'Administration', roles: ['Partner', 'Admin'], permission: { module: 'settings', action: 'view' } },

  { id: 'client-dashboard', path: '/client/dashboard', label: 'My Dashboard', group: 'Client Portal', roles: ['Client'], permission: { module: 'dashboard', action: 'view' } },
  { id: 'client-messages', path: '/client/messages', label: 'Messages', group: 'Client Portal', roles: ['Client'], permission: { module: 'messages', action: 'view' } },
];

export const ROUTE_GUARDS: { pathPrefix: string; permission: NavPermission; roles?: string[] }[] = [
  { pathPrefix: '/engagements/', permission: { module: 'engagements', action: 'view' }, roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'] },
  { pathPrefix: '/requests/', permission: { module: 'clients', action: 'view' }, roles: ['Partner', 'Admin', 'Manager'] },
  { pathPrefix: '/observations', permission: { module: 'reports', action: 'view' }, roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'] },
  { pathPrefix: '/form3cd', permission: { module: 'reports', action: 'view' }, roles: ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'] },
];

export function navItemHref(item: NavCatalogItem): string {
  if (!item.tab) return item.path;
  return `${item.path}?tab=${item.tab}`;
}
