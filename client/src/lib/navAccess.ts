import type { User } from '../types';
import {
  NAV_CATALOG,
  NAV_GROUPS_ORDER,
  ROUTE_GUARDS,
  type NavCatalogItem,
  type NavPermission,
} from './navCatalog';
import { passesHierarchyNavGate, passesHierarchyRouteGate } from './hierarchyAccess';
import { canViewManagementInsights } from './gradeCapabilities';

/** Legacy paths that redirect elsewhere in App.tsx — must pass RouteGuard before Navigate runs. */
const LEGACY_REDIRECT_PATHS = new Set([
  '/workflow',
  '/engagements/workflow',
  '/observations',
  '/form3cd',
  '/time-billing',
  '/portals/credentials',
  '/client-master',
  '/onboarding',
  '/audit-log',
  '/portal',
]);

/** Permission check for nav/routes — uses DB permissions for every role (no Admin/Partner bypass). */
export function hasNavPermission(
  user: User | null | undefined,
  module: string,
  action = 'view'
): boolean {
  if (!user) return false;
  const keys = user.permissions ?? [];
  if (keys.includes('*')) return true;
  return keys.includes(`${module}:${action}`);
}

function passesRoleGate(user: User, item: NavCatalogItem): boolean {
  if (item.roles && !item.roles.includes(user.role)) return false;
  if (user.role === 'Client' && item.group !== 'Client Portal') return false;
  if (user.role !== 'Client' && item.group === 'Client Portal') return false;
  if (user.role === 'Intern' && item.hierarchyExclude) return false;
  return true;
}

function canAccessNavItem(user: User | null | undefined, item: NavCatalogItem): boolean {
  if (!user) return false;
  if (!passesRoleGate(user, item)) return false;
  if (!passesHierarchyNavGate(user, item.path)) return false;
  if (item.id === 'management-reports' && !canViewManagementInsights(user.role, user.hierarchyLevel?.code)) {
    return false;
  }
  if (item.permission) {
    return hasNavPermission(user, item.permission.module, item.permission.action ?? 'view');
  }
  return true;
}

export function canAccessRoute(
  user: User | null | undefined,
  pathname: string,
  search = ''
): boolean {
  if (!user) return false;

  const tab = new URLSearchParams(search).get('tab') ?? undefined;
  const path = pathname.replace(/\/$/, '') || '/';

  if (LEGACY_REDIRECT_PATHS.has(path)) {
    return true;
  }

  /** Error page — any signed-in user may land here from RouteGuard. */
  if (path === '/unauthorized') {
    return true;
  }

  if (user.role === 'Client' && path === '/') {
    return true;
  }

  if (path === '/leave-stipend' && !tab) {
    return NAV_CATALOG.filter((i) => i.path === '/leave-stipend').some((i) =>
      canAccessNavItem(user, i)
    );
  }

  const exact = NAV_CATALOG.find((item) => {
    const itemPath = item.path.replace(/\/$/, '') || '/';
    if (itemPath !== path) return false;
    if (item.tab) return item.tab === tab;
    if (tab && item.path === '/leave-stipend') return false;
    return true;
  });

  if (exact) {
    if (!passesHierarchyRouteGate(user, path, search)) return false;
    return canAccessNavItem(user, exact);
  }

  if (!passesHierarchyRouteGate(user, path, search)) return false;

  const prefixGuard = ROUTE_GUARDS.find((g) => path.startsWith(g.pathPrefix));
  if (prefixGuard) {
    if (prefixGuard.roles && !prefixGuard.roles.includes(user.role)) return false;
    return hasNavPermission(
      user,
      prefixGuard.permission.module,
      prefixGuard.permission.action ?? 'view'
    );
  }

  const prefixNav = NAV_CATALOG.find((item) => {
    if (item.path === '/') return false;
    return path.startsWith(item.path + '/');
  });
  if (prefixNav) return canAccessNavItem(user, prefixNav);

  if (path === '/leave-stipend' && tab === 'manage') {
    return canAccessRoute(user, pathname, '?tab=inbox');
  }

  // Leave & Stipend sub-tabs not listed as separate nav items
  if (path === '/leave-stipend' && tab === 'calendar') {
    return NAV_CATALOG.filter((i) => i.path === '/leave-stipend').some((i) =>
      canAccessNavItem(user, i)
    );
  }
  if (path === '/leave-stipend' && tab === 'compoff') {
    return NAV_CATALOG.filter((i) => i.path === '/leave-stipend').some((i) =>
      canAccessNavItem(user, i)
    );
  }
  if (path === '/leave-stipend' && tab === 'holidays') {
    return Boolean(user && ['Partner', 'Admin', 'HR'].includes(user.role));
  }
  if (path === '/leave-stipend' && tab === 'ediary') {
    const stipend = NAV_CATALOG.find((i) => i.id === 'stipend');
    return stipend ? canAccessNavItem(user, stipend) : false;
  }

  // Settings sub-tabs inherit page-level access (settings:view)
  if (path === '/settings') {
    const settings = NAV_CATALOG.find((i) => i.id === 'settings');
    return settings ? canAccessNavItem(user, settings) : false;
  }

  return false;
}

export function groupNavCatalog(user: User | null | undefined): { label: string; items: NavCatalogItem[] }[] {
  if (!user) return [];

  const visible = NAV_CATALOG.filter(
    (item) => !item.sidebarHidden && canAccessNavItem(user, item)
  );

  const byGroup = new Map<string, NavCatalogItem[]>();
  for (const item of visible) {
    const list = byGroup.get(item.group) ?? [];
    list.push(item);
    byGroup.set(item.group, list);
  }

  return NAV_GROUPS_ORDER.filter((g) => byGroup.has(g)).map((label) => ({
    label,
    items: byGroup.get(label)!,
  }));
}
