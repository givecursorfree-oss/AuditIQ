import { lazy, Suspense, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';

// Retry lazy imports once on chunk-load failure (handles Vercel redeploy cache invalidation)
function lazyRetry(factory: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    factory().catch(() => {
      // If chunk fails to load (e.g. after redeploy), reload the page once
      const hasReloaded = sessionStorage.getItem('chunk_reload');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
        return { default: () => null } as { default: React.ComponentType };
      }
      sessionStorage.removeItem('chunk_reload');
      return factory(); // Re-throw if still fails after reload
    })
  );
}

// Lazy-load pages for code-splitting
const Login = lazyRetry(() => import('./pages/Login'));
const Register = lazyRetry(() => import('./pages/Register'));
const Dashboard = lazyRetry(() => import('./pages/Dashboard'));
const Engagements = lazyRetry(() => import('./pages/Engagements'));
const Workpapers = lazyRetry(() => import('./pages/Workpapers'));
const Documents = lazyRetry(() => import('./pages/Documents'));
const Copilot = lazyRetry(() => import('./pages/Copilot'));
const Attendance = lazyRetry(() => import('./pages/Attendance'));
const Reports = lazyRetry(() => import('./pages/Reports'));
const Settings = lazyRetry(() => import('./pages/Settings'));
const ClientPortal = lazyRetry(() => import('./pages/ClientPortal'));
const VerifyEmail = lazyRetry(() => import('./pages/VerifyEmail'));
const AuditLog = lazyRetry(() => import('./pages/AuditLog'));
const Observations = lazyRetry(() => import('./pages/Observations'));
const Form3CD = lazyRetry(() => import('./pages/Form3CD'));
const TimeBilling = lazyRetry(() => import('./pages/TimeBilling'));
const Unauthorized = lazyRetry(() => import('./pages/Unauthorized'));
const Messages = lazyRetry(() => import('./pages/Messages'));
const Employees = lazyRetry(() => import('./pages/Employees'));
const ClientMaster = lazyRetry(() => import('./pages/ClientMaster'));
const Approvals = lazyRetry(() => import('./pages/Approvals'));
const Onboarding = lazyRetry(() => import('./pages/Onboarding'));
const WorkflowBoard = lazyRetry(() => import('./pages/WorkflowBoard'));
const TimeTracker = lazyRetry(() => import('./pages/TimeTracker'));
const PasswordVault = lazyRetry(() => import('./pages/PasswordVault'));
const ManagementReports = lazyRetry(() => import('./pages/ManagementReports'));
const LeaveStipend = lazyRetry(() => import('./pages/LeaveStipend'));
const EngagementDetail = lazyRetry(() => import('./pages/EngagementDetail'));

// Error boundary to catch render errors and prevent blank screen
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error boundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-surface">
          <div className="text-center space-y-4">
            <img src="/logo.png" alt="AuditIQ" className="h-14 w-auto mx-auto object-contain" />
            <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
            <p className="text-sm text-foreground-muted">Please refresh the page to continue.</p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.png" alt="AuditIQ" className="h-14 w-auto object-contain dark:brightness-0 dark:invert" />
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

/** Route guard that checks user role against a whitelist */
function RoleRoute({ roles }: { roles: string[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    if (user.role === 'Client') return <Navigate to="/client/dashboard" replace />;
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function ClientRedirect() {
  const { user } = useAuth();
  if (user?.role === 'Client') return <Navigate to="/client/dashboard" replace />;
  return <Dashboard />;
}

function PublicRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* Public routes */}
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
            </Route>

            {/* Unauthorized page (no layout) */}
            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* Protected routes — all authenticated users */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<ClientRedirect />} />
                <Route path="/documents" element={<Documents />} />

                {/* Partner / Admin / Manager / Staff only — audit workflows */}
                <Route element={<RoleRoute roles={['Partner', 'Admin', 'Manager', 'Staff']} />}>
                  <Route path="/engagements" element={<Engagements />} />
                  <Route path="/engagements/:id" element={<EngagementDetail />} />
                  <Route path="/workflow" element={<WorkflowBoard />} />
                  <Route path="/workpapers" element={<Workpapers />} />
                  <Route path="/copilot" element={<Copilot />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/observations" element={<Observations />} />
                  <Route path="/form3cd" element={<Form3CD />} />
                  <Route path="/time-billing" element={<TimeBilling />} />
                  <Route path="/time-tracker" element={<TimeTracker />} />
                  <Route path="/leave-stipend" element={<LeaveStipend />} />
                  <Route path="/messages" element={<Messages />} />
                  <Route path="/employees" element={<Employees />} />
                  <Route path="/client-master" element={<ClientMaster />} />
                  <Route path="/approvals" element={<Approvals />} />
                </Route>

                {/* Partner / Admin / Manager only */}
                <Route element={<RoleRoute roles={['Partner', 'Admin', 'Manager']} />}>
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route path="/vault" element={<PasswordVault />} />
                </Route>

                {/* Partner / Admin only — management reports */}
                <Route element={<RoleRoute roles={['Partner', 'Admin']} />}>
                  <Route path="/management-reports" element={<ManagementReports />} />
                </Route>

                {/* Partner / Admin only — administration */}
                <Route element={<RoleRoute roles={['Partner', 'Admin']} />}>
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/audit-log" element={<AuditLog />} />
                </Route>

                {/* Client portal — Client role */}
                <Route element={<RoleRoute roles={['Client']} />}>
                  <Route path="/client/dashboard" element={<ClientPortal />} />
                  <Route path="/client/messages" element={<Messages />} />
                  <Route path="/portal" element={<Navigate to="/client/dashboard" replace />} />
                </Route>
              </Route>
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
