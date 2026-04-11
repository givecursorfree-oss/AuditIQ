import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  FolderOpen,
  Bot,
  Clock,
  BarChart3,
  LogOut,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/engagements', icon: Briefcase, label: 'Engagements' },
  { to: '/workpapers', icon: FileText, label: 'Workpapers' },
  { to: '/documents', icon: FolderOpen, label: 'Documents' },
  { to: '/copilot', icon: Bot, label: 'AI Copilot' },
  { to: '/attendance', icon: Clock, label: 'Attendance' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/settings', icon: SettingsIcon, label: 'Settings' },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-close mobile sidebar on route change
  useEffect(() => {
    onMobileClose();
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-screen bg-card border-r border-border flex flex-col z-50
          transition-all duration-300 ease-in-out
          ${collapsed ? 'lg:w-16' : 'lg:w-60'}
          w-64 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-border">
          <div className="flex items-center gap-2">
            {collapsed ? (
              <img src="/logo.png" alt="AuditIQ" className="h-10 w-10 object-contain shrink-0 dark:brightness-0 dark:invert" />
            ) : (
              <img src="/logo.png" alt="AuditIQ" className="h-11 w-auto object-contain dark:brightness-0 dark:invert" />
            )}
          </div>
          {/* Mobile close button */}
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-hover-bg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-foreground-muted hover:text-foreground hover:bg-hover-bg'
                }`
              }
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User & Collapse */}
        <div className="border-t border-border p-2 space-y-1">
          {!collapsed && user && (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                {user.initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-foreground-muted truncate">{user.role}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground-muted hover:text-danger hover:bg-danger/10 w-full transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>

          {/* Desktop-only collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center w-full p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-hover-bg transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>
    </>
  );
}
