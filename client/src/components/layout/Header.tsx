import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sun,
  Moon,
  Folder,
  Search,
  X,
  FileText,
  Briefcase,
  Users,
  Bell,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLayoutChrome } from '../../context/LayoutChromeContext';
import { SidebarTrigger } from '../ui/sidebar';
import { Button } from '../ui/button';
import api from '../../services/api';
import { useNavBadges } from '../../context/NavBadgesContext';
import StaffPresenceSelector from '../StaffPresenceSelector';
import { isStaffPresenceRole } from '@/lib/presence';
import { getRouteLabel } from '@/lib/routeLabels';
import { performHeaderSearch, type HeaderSearchResult } from '@/lib/headerSearch';
import {
  HeaderNotificationsPanel,
  resolveNotificationLink,
  type AppNotification,
} from './HeaderNotificationsPanel';

interface SearchResult extends HeaderSearchResult {}

const typeIcon = {
  engagement: Briefcase,
  document: FileText,
  client: Users,
};
const typeLabel = {
  engagement: 'Engagement',
  document: 'Document',
  client: 'Client',
};

export default function Header() {
  const { user, loading: authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { searchInputRef, registerToggleNotifications } = useLayoutChrome();
  const { notificationCount: unreadCount, adjustNotificationCount, refresh: refreshBadges } = useNavBadges();

  const [lastUpdated] = useState(() =>
    new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  );
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const routeLabel = getRouteLabel(location.pathname);

  const openNotifications = useCallback(async () => {
    if (showNotifications) {
      setShowNotifications(false);
      return;
    }
    setShowNotifications(true);
    setLoadingNotifications(true);
    try {
      const { data } = await api.get<AppNotification[]>('/notifications');
      setNotifications(data);
      await api.post('/nav-badges/ack', { scopes: ['notifications'] });
      setNotifications(data.map((n) => ({ ...n, isRead: true })));
      void refreshBadges();
    } catch {
      /* silent */
    } finally {
      setLoadingNotifications(false);
    }
  }, [showNotifications, refreshBadges]);

  useEffect(() => {
    registerToggleNotifications(() => {
      void openNotifications();
    });
  }, [registerToggleNotifications, openNotifications]);

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      adjustNotificationCount(-1);
      void refreshBadges();
    } catch {
      /* silent */
    }
  };

  const openNotification = async (notification: AppNotification) => {
    if (!notification.isRead) await markAsRead(notification.id);
    const link = resolveNotificationLink(notification);
    if (link) {
      setShowNotifications(false);
      navigate(link);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      await api.post('/nav-badges/ack', { scopes: ['notifications'] });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      adjustNotificationCount(-unreadCount);
      void refreshBadges();
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (query.trim().length < 1) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    try {
      const results = await performHeaderSearch(query);
      setSearchResults(results);
      setShowResults(true);
    } catch {
      setSearchResults([]);
      setShowResults(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => performSearch(searchQuery), 250);
    return () => clearTimeout(timeout);
  }, [searchQuery, performSearch]);

  function handleResultClick(result: SearchResult) {
    const query = searchQuery.trim();
    setShowResults(false);
    setSearchQuery('');
    setMobileSearchOpen(false);
    if (result.type === 'engagement') {
      navigate(result.route);
      return;
    }
    navigate(query ? `${result.route}?q=${encodeURIComponent(query)}` : result.route);
  }

  return (
    <>
      <header className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b border-border bg-card sticky top-0 z-20 w-full shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2 text-muted-foreground min-w-0">
            <Folder className="size-4 shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">{routeLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="text-xs text-muted-foreground hidden md:inline">Last Updated {lastUpdated}</span>

          <div ref={searchRef} className="relative hidden lg:block" data-onboard="header-search">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search engagements, clients, documents…"
              aria-label="Search engagements, clients, and documents"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              onKeyDown={(e) => e.key === 'Escape' && setShowResults(false)}
              className="pl-8 h-8 w-[200px] xl:w-[260px] text-sm rounded-lg border border-border bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            {showResults && (
              <div className="absolute top-full right-0 mt-1 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-80 overflow-y-auto z-50">
                {searchResults.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No results for &ldquo;{searchQuery.trim()}&rdquo;
                  </p>
                ) : (
                  searchResults.map((r) => {
                    const Icon = typeIcon[r.type];
                    return (
                      <button
                        key={r.id + r.type}
                        type="button"
                        onClick={() => handleResultClick(r)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                      >
                        <Icon className="size-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{r.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {typeLabel[r.type]}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 lg:hidden"
            onClick={() => setMobileSearchOpen(true)}
            aria-label="Search"
            data-onboard="header-search"
          >
            <Search className="size-4" />
          </Button>

          <div ref={notifRef} className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 relative"
              onClick={() => void openNotifications()}
              aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
            >
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex size-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold tabular-nums text-white"
                  aria-hidden
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
            {showNotifications && (
              <HeaderNotificationsPanel
                notifications={notifications}
                loading={loadingNotifications}
                unreadCount={unreadCount}
                onMarkAllRead={() => void markAllRead()}
                onOpen={(n) => void openNotification(n)}
              />
            )}
          </div>

          <Button variant="ghost" size="icon" className="size-8" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          {user && isStaffPresenceRole(user.role) && (
            <div className="hidden sm:block">
              <StaffPresenceSelector />
            </div>
          )}
        </div>
      </header>

      {mobileSearchOpen && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm p-4 lg:hidden">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                autoFocus
                type="search"
                placeholder="Search engagements, clients, documents…"
                aria-label="Search engagements, clients, and documents"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close search"
              onClick={() => {
                setMobileSearchOpen(false);
                setSearchQuery('');
                setShowResults(false);
              }}
            >
              <X className="size-5" />
            </Button>
          </div>
          {searchQuery.trim().length > 0 && searchResults.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No results for &ldquo;{searchQuery.trim()}&rdquo;
            </p>
          ) : (
            searchResults.map((r) => {
              const Icon = typeIcon[r.type];
              return (
                <button
                  key={r.id + r.type}
                  type="button"
                  onClick={() => handleResultClick(r)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 rounded-lg text-left"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
