import { Bell, Search, Sun, Moon, Menu, FileText, Briefcase, ClipboardList, Users, X } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: 'engagement' | 'document' | 'workpaper' | 'client';
  route: string;
}

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/notifications/unread-count')
      .then(({ data }) => setUnreadCount(data.count))
      .catch(() => {});
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setSearchResults([]); setShowResults(false); return; }
    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    try {
      // Search engagements
      const engRes = await api.get('/engagements');
      const engagements = engRes.data?.engagements || engRes.data || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      engagements.forEach((e: any) => {
        if (e.title?.toLowerCase().includes(q) || e.client?.name?.toLowerCase().includes(q) || e.type?.toLowerCase().includes(q))
          results.push({ id: e.id, title: e.title, subtitle: e.client?.name || e.type, type: 'engagement', route: '/engagements' });
      });

      // Search documents
      const docRes = await api.get('/documents');
      const documents = Array.isArray(docRes.data) ? docRes.data : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      documents.forEach((d: any) => {
        if (d.originalName?.toLowerCase().includes(q) || d.category?.toLowerCase().includes(q) || d.folder?.toLowerCase().includes(q))
          results.push({ id: d.id, title: d.originalName || d.fileName, subtitle: d.category || d.folder, type: 'document', route: '/documents' });
      });

      // Search workpapers
      const wpRes = await api.get('/workpapers');
      const workpapers = Array.isArray(wpRes.data) ? wpRes.data : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workpapers.forEach((w: any) => {
        if (w.title?.toLowerCase().includes(q) || w.reference?.toLowerCase().includes(q) || w.section?.toLowerCase().includes(q))
          results.push({ id: w.id, title: w.title, subtitle: w.reference + ' · ' + w.section, type: 'workpaper', route: '/workpapers' });
      });

      // Search admin users
      const usrRes = await api.get('/admin/users');
      const users = Array.isArray(usrRes.data) ? usrRes.data : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users.forEach((u: any) => {
        const name = `${u.firstName} ${u.lastName}`.toLowerCase();
        if (name.includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q))
          results.push({ id: u.id, title: `${u.firstName} ${u.lastName}`, subtitle: u.role + ' · ' + u.designation, type: 'client', route: '/settings' });
      });
    } catch { /* silent in demo mode */ }

    setSearchResults(results.slice(0, 8));
    setShowResults(results.length > 0);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => performSearch(searchQuery), 200);
    return () => clearTimeout(timeout);
  }, [searchQuery, performSearch]);

  function handleResultClick(result: SearchResult) {
    setShowResults(false);
    setSearchQuery('');
    setMobileSearchOpen(false);
    navigate(result.route);
  }

  const typeIcon = { engagement: Briefcase, document: FileText, workpaper: ClipboardList, client: Users };
  const typeLabel = { engagement: 'Engagement', document: 'Document', workpaper: 'Workpaper', client: 'Team' };

  return (
    <header className="sticky top-0 z-40 h-14 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-3 sm:px-4 lg:px-6 gap-2">
      {/* Left — Hamburger + Search */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-1 rounded-lg text-foreground-muted hover:text-foreground hover:bg-hover-bg transition-colors"
        >
          <Menu size={20} />
        </button>

        {/* Desktop Search */}
        <div ref={searchRef} className="relative hidden sm:block sm:w-64 lg:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <input
            type="text"
            placeholder="Search engagements, clients, documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
            onKeyDown={(e) => e.key === 'Escape' && setShowResults(false)}
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {showResults && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-80 overflow-y-auto z-50">
              {searchResults.map((r) => {
                const Icon = typeIcon[r.type];
                return (
                  <button key={r.id + r.type} onClick={() => handleResultClick(r)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-hover-bg transition-colors text-left">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon size={14} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                      <p className="text-xs text-foreground-muted truncate">{r.subtitle}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border text-foreground-muted flex-shrink-0">{typeLabel[r.type]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Mobile search icon */}
        <button onClick={() => setMobileSearchOpen(true)} className="sm:hidden p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-hover-bg transition-colors">
          <Search size={18} />
        </button>

        {/* Mobile search overlay */}
        {mobileSearchOpen && (
          <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm p-4 sm:hidden">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <button onClick={() => { setMobileSearchOpen(false); setSearchQuery(''); setShowResults(false); }} className="p-2 text-foreground-muted"><X size={20} /></button>
            </div>
            {searchResults.map((r) => {
              const Icon = typeIcon[r.type];
              return (
                <button key={r.id + r.type} onClick={() => handleResultClick(r)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-hover-bg transition-colors text-left rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Icon size={14} className="text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-foreground-muted truncate">{r.subtitle}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border text-foreground-muted">{typeLabel[r.type]}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 sm:gap-3">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-hover-bg transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-hover-bg transition-colors">
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger rounded-full text-[10px] font-bold text-white flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* User badge — full on desktop, avatar only on mobile */}
        {user && (
          <>
            {/* Desktop */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-surface rounded-lg border border-border">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
                {user.initials}
              </div>
              <span className="text-sm text-foreground-secondary">{user.firstName}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                user.role === 'Partner' ? 'bg-primary/15 text-primary' :
                user.role === 'Manager' ? 'bg-purple-500/15 text-purple-400' :
                user.role === 'Staff' ? 'bg-success/15 text-success' :
                'bg-hover-bg text-foreground-muted'
              }`}>{user.role}</span>
            </div>
            {/* Mobile avatar */}
            <div className="sm:hidden w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
              {user.initials}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
