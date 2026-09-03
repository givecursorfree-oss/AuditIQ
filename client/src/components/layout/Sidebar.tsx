import { useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { appConfirm } from '@/context/AppDialogContext';
import type { LucideIcon } from 'lucide-react';
import {
  Search,
  Bell,
  LayoutDashboard,
  Briefcase,
  Kanban,
  Building2,
  FileText,
  FolderOpen,
  CheckSquare,
  Timer,
  Clock,
  Calendar,
  GraduationCap,
  Users,
  BarChart3,
  Receipt,
  PieChart,
  Lock,
  Settings,
  LogOut,
  MessageSquare,
  X,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  FileStack,
  CalendarClock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLayoutChrome } from '../../context/LayoutChromeContext';
import { useNavBadges } from '../../context/NavBadgesContext';
import { NavCountBadge } from '../ui/nav-count-badge';
import { CHROME_NOTIFICATIONS_BADGE_KEY } from '../../lib/navBadgeMap';
import { formatRoleLabel } from '../../lib/roleLabels';
import { navItemHref, type NavCatalogItem } from '../../lib/navCatalog';
import { groupNavCatalog } from '../../lib/navAccess';
import { NAV_ONBOARD_ATTR } from '../../lib/productTour';
import SidebarUserMenu from './SidebarUserMenu';
import AuditIQLogo from '../brand/AuditIQLogo';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '../ui/sidebar';

const MUTED = 'text-muted-foreground';

const iconByPath: Record<string, { icon: LucideIcon; iconColor: string }> = {
  '/': { icon: LayoutDashboard, iconColor: MUTED },
  '/engagements/workflow': { icon: Kanban, iconColor: MUTED },
  '/workflow': { icon: Kanban, iconColor: MUTED },
  '/services': { icon: ClipboardList, iconColor: MUTED },
  '/requests': { icon: ClipboardList, iconColor: MUTED },
  '/document-library': { icon: FileStack, iconColor: MUTED },
  '/admin/scheduler': { icon: CalendarClock, iconColor: MUTED },
  '/engagements': { icon: Briefcase, iconColor: MUTED },
  '/clients': { icon: Building2, iconColor: MUTED },
  '/workpapers': { icon: FileText, iconColor: MUTED },
  '/documents': { icon: FolderOpen, iconColor: MUTED },
  '/approvals': { icon: CheckSquare, iconColor: MUTED },
  '/time-tracker': { icon: Timer, iconColor: MUTED },
  '/attendance': { icon: Clock, iconColor: MUTED },
  '/leave-stipend': { icon: Calendar, iconColor: MUTED },
  '/employees': { icon: Users, iconColor: MUTED },
  '/reports': { icon: BarChart3, iconColor: MUTED },
  '/billing': { icon: Receipt, iconColor: MUTED },
  '/management-reports': { icon: PieChart, iconColor: MUTED },
  '/vault': { icon: Lock, iconColor: MUTED },
  '/settings': { icon: Settings, iconColor: MUTED },
  '/messages': { icon: MessageSquare, iconColor: MUTED },
  '/client/dashboard': { icon: Building2, iconColor: MUTED },
  '/client/messages': { icon: MessageSquare, iconColor: MUTED },
  '/claims': { icon: Receipt, iconColor: MUTED },
  '/notices': { icon: Bell, iconColor: MUTED },
};

const iconByNavId: Record<string, { icon: LucideIcon; iconColor: string }> = {
  stipend: { icon: GraduationCap, iconColor: MUTED },
  'leave-manage': { icon: Calendar, iconColor: MUTED },
  'leave-apply': { icon: Calendar, iconColor: MUTED },
};

interface ChromeItem {
  to: string;
  icon: LucideIcon;
  label: string;
  iconColor: string;
  action: 'search' | 'notifications';
}

const chromeItems: ChromeItem[] = [
  { to: '#search', icon: Search, label: 'Search', iconColor: MUTED, action: 'search' },
  { to: '#notifications', icon: Bell, label: 'Notification', iconColor: MUTED, action: 'notifications' },
];

function navIcon(item: NavCatalogItem) {
  return iconByNavId[item.id] ?? iconByPath[item.path] ?? { icon: LayoutDashboard, iconColor: 'text-foreground' };
}

export default function AppSidebar() {
  const { user, logout } = useAuth();
  const { focusSearch, toggleNotifications } = useLayoutChrome();
  const { getNavBadge, badges } = useNavBadges();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { setOpenMobile, isMobile, toggleSidebar, open } = useSidebar();

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, search, isMobile, setOpenMobile]);

  const filteredGroups = useMemo(() => groupNavCatalog(user), [user]);

  const filteredChrome = useMemo(() => {
    if (!user || user.role === 'Client') return [];
    return chromeItems;
  }, [user]);

  const handleLogout = async () => {
    const ok = await appConfirm({
      title: 'Sign out?',
      message:
        'Sign out of AuditIQ only. Your attendance for today stays open until you tap Check out on the Attendance page.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    await logout();
    navigate('/login');
  };

  const isActive = (item: NavCatalogItem) => {
    const href = navItemHref(item);
    const [path, query] = href.split('?');
    if (path === '/') return pathname === '/';
    const pathMatch = pathname === path || pathname.startsWith(path + '/');
    if (!pathMatch) return false;
    if (query) {
      const tab = new URLSearchParams(query).get('tab');
      const currentTab = new URLSearchParams(search).get('tab');
      return tab === currentTab;
    }
    if (item.path === '/leave-stipend' && !item.tab) return false;
    return !search.includes('tab=') || item.path !== '/leave-stipend';
  };

  const renderNavButton = (item: NavCatalogItem) => {
    const meta = navIcon(item);
    const Icon = meta.icon;
    const href = navItemHref(item);
    const active = isActive(item);

    const onboardAttr = NAV_ONBOARD_ATTR[item.id];

    const badgeCount = getNavBadge(item.id);

    return (
      <SidebarMenuButton asChild isActive={active} className="h-9">
        <Link to={href} {...(onboardAttr ? { 'data-onboard': onboardAttr } : {})}>
          <span className="relative shrink-0">
            <Icon className={cn('size-4', active ? 'text-primary' : meta.iconColor)} />
            <span className="group-data-[collapsible=icon]:block hidden">
              <NavCountBadge count={badgeCount} compact />
            </span>
          </span>
          <span className="text-sm">{item.label}</span>
          <span className="group-data-[collapsible=icon]:hidden">
            <NavCountBadge count={badgeCount} />
          </span>
        </Link>
      </SidebarMenuButton>
    );
  };

  const renderChromeButton = (item: ChromeItem) => {
    const Icon = item.icon;
    if (item.action === 'search') {
      return (
        <SidebarMenuButton className="h-9" onClick={focusSearch} data-onboard="sidebar-search" aria-label="Search">
          <Icon className={cn('size-4 shrink-0', item.iconColor)} />
          <span className="text-sm">Search</span>
          <span className="ml-auto flex size-5 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
            /
          </span>
        </SidebarMenuButton>
      );
    }
    const notifCount = badges[CHROME_NOTIFICATIONS_BADGE_KEY] ?? 0;
    return (
      <SidebarMenuButton className="h-9" onClick={toggleNotifications} aria-label="Notifications">
        <span className="relative shrink-0">
          <Icon className={cn('size-4', item.iconColor)} />
          <span className="group-data-[collapsible=icon]:block hidden">
            <NavCountBadge count={notifCount} compact />
          </span>
        </span>
        <span className="text-sm">{item.label}</span>
        <span className="ml-auto flex items-center gap-1.5 group-data-[collapsible=icon]:hidden">
          <NavCountBadge count={notifCount} />
        </span>
      </SidebarMenuButton>
    );
  };

  return (
    <Sidebar collapsible="icon" className="!border-r-0">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <AuditIQLogo className="h-9 w-auto max-w-full object-contain group-data-[collapsible=icon]:h-8" />
          </Link>
          {isMobile && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 lg:hidden" onClick={() => setOpenMobile(false)} aria-label="Close menu">
              <X className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 shrink-0 lg:flex"
            onClick={toggleSidebar}
            aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {open ? <ChevronsLeft className="size-4" /> : <ChevronsRight className="size-4" />}
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {filteredChrome.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredChrome.map((item) => (
                  <SidebarMenuItem key={item.action}>{renderChromeButton(item)}</SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredGroups.map((group) => (
          <SidebarGroup key={group.label} label={group.label} collapsible defaultOpen={group.label !== 'Administration'}>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.id}>{renderNavButton(item)}</SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarUserMenu />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-9 text-sidebar-muted hover:text-destructive" onClick={() => void handleLogout()}>
              <LogOut className="size-4 shrink-0" />
              <span className="text-sm">Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {user && (
          <p className="px-2 pb-1 text-[10px] text-sidebar-muted group-data-[collapsible=icon]:hidden">
            {formatRoleLabel(user.role)}
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}