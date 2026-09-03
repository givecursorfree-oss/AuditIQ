import { lazy, Suspense, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuditIQLogo from './components/brand/AuditIQLogo';
import PageLoading from './components/layout/PageLoading';
import { Button } from './components/ui/button';
import { AppDialogProvider } from './context/AppDialogContext';
import { AppToastProvider } from './context/AppToastContext';
import { AttendanceConfirmationProvider } from './context/AttendanceConfirmationContext';
import Layout from './components/layout/Layout';
import RouteGuard from './components/layout/RouteGuard';
import { SessionTimeoutGuard } from './components/auth/SessionTimeoutGuard';
import CookieConsentBanner from './components/cookie-consent/CookieConsentBanner';
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
const EngagementPortfolio = lazyRetry(() => import('./pages/EngagementPortfolio'));
const Workpapers = lazyRetry(() => import('./pages/Workpapers'));
const Documents = lazyRetry(() => import('./pages/Documents'));
const Attendance = lazyRetry(() => import('./pages/Attendance'));
const Reports = lazyRetry(() => import('./pages/Reports'));
const Settings = lazyRetry(() => import('./pages/Settings'));
const ClientPortal = lazyRetry(() => import('./pages/ClientPortal'));
const Clients = lazyRetry(() => import('./pages/Clients'));
const VerifyEmail = lazyRetry(() => import('./pages/VerifyEmail'));
const ForgotPassword = lazyRetry(() => import('./pages/ForgotPassword'));
const ResetPassword = lazyRetry(() => import('./pages/ResetPassword'));
const PrivacyPolicy = lazyRetry(() => import('./pages/LegalPages').then((m) => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazyRetry(() => import('./pages/LegalPages').then((m) => ({ default: m.TermsOfService })));
const SecurityCompliance = lazyRetry(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.SecurityCompliance }))
);
const Unauthorized = lazyRetry(() => import('./pages/Unauthorized'));
const Messages = lazyRetry(() => import('./pages/Messages'));
const Employees = lazyRetry(() => import('./pages/Employees'));
const Approvals = lazyRetry(() => import('./pages/Approvals'));
const ServiceCatalog = lazyRetry(() => import('./pages/ServiceCatalog'));
const TimeTracker = lazyRetry(() => import('./pages/TimeTracker'));
const PasswordVault = lazyRetry(() => import('./pages/PasswordVault'));
const ManagementReports = lazyRetry(() => import('./pages/ManagementReports'));
const LeaveStipend = lazyRetry(() => import('./pages/LeaveStipend'));
const EngagementDetail = lazyRetry(() => import('./pages/EngagementDetail'));
const Billing = lazyRetry(() => import('./pages/Billing'));
const PendingRequests = lazyRetry(() => import('./pages/PendingRequests'));
const RequestDetail = lazyRetry(() => import('./pages/RequestDetail'));
const DocumentLibraryTemplates = lazyRetry(() => import('./pages/DocumentLibraryTemplates'));
const EngagementLetterPage = lazyRetry(() => import('./pages/EngagementLetterPage'));
const SchedulerAdmin = lazyRetry(() => import('./pages/SchedulerAdmin'));
const BillingPending = lazyRetry(() => import('./pages/BillingPending'));
const Timesheets = lazyRetry(() => import('./pages/Timesheets'));
const ComplianceCalendarPage = lazyRetry(() => import('./pages/ComplianceCalendarPage'));
const NoticesDashboard = lazyRetry(() => import('./pages/NoticesDashboard'));
const NoticeDetail = lazyRetry(() => import('./pages/NoticeDetail'));
const StaffSchedulePage = lazyRetry(() => import('./pages/StaffSchedulePage'));
const ClaimsPending = lazyRetry(() => import('./pages/claims/ClaimsPending'));
const LateHoursClaimForm = lazyRetry(() => import('./pages/claims/LateHoursClaimForm').then((m) => ({ default: m.LateHoursClaimForm })));
const DeptVisitClaimForm = lazyRetry(() => import('./pages/claims/DeptVisitClaimForm').then((m) => ({ default: m.DeptVisitClaimForm })));
const ClaimBatchesPage = lazyRetry(() => import('./pages/claims/ClaimBatchesPage'));
const ClaimsHub = lazyRetry(() => import('./pages/claims/ClaimsHub'));
const NewStaffClaimForm = lazyRetry(() => import('./pages/claims/NewStaffClaimForm').then((m) => ({ default: m.NewStaffClaimForm })));

// Error boundary to catch render errors and prevent blank screen
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error boundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-surface">
          <div className="text-center space-y-4 max-w-md px-4">
            <AuditIQLogo className="h-14 w-auto mx-auto object-contain" />
            <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
            <p className="text-sm text-foreground-muted">Please refresh the page to continue.</p>
            {this.state.message ? (
              <p className="text-xs text-foreground-muted break-words font-mono bg-muted/40 rounded-md px-3 py-2 text-left">
                {this.state.message}
              </p>
            ) : null}
            <Button
              type="button"
              onClick={() => window.location.reload()}
              size="sm"
            >
              Refresh Page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function PageFallback() {
  return <PageLoading label="Loading page…" className="py-20" />;
}

function AuthLoadingScreen({ label }: { label: string }) {
  return (
    <div className="h-screen flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-4">
        <AuditIQLogo className="h-14 w-auto object-contain" />
        <PageLoading label={label} className="py-0" />
      </div>
    </div>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthLoadingScreen label="Checking your session…" />;
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <SessionTimeoutGuard />
      <Outlet />
    </>
  );
}

function ClientRedirect() {
  const { user } = useAuth();
  if (user?.role === 'Client') return <Navigate to="/client/dashboard" replace />;
  return <Dashboard />;
}

function PublicRoute() {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoadingScreen label="Loading sign-in…" />;
  if (user) {
    return (
      <Navigate to={user.role === 'Client' ? '/client/dashboard' : '/'} replace />
    );
  }
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AttendanceConfirmationProvider>
        <AppToastProvider>
        <AppDialogProvider>
        <ErrorBoundary>
        <CookieConsentBanner />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* Public routes */}
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>

            {/* Public pages (accessible signed in or out) */}
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/security-compliance" element={<SecurityCompliance />} />

            {/* Unauthorized — inside layout for orientation (Trunk Test) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/unauthorized" element={<Unauthorized />} />
                <Route element={<RouteGuard />}>
                  <Route index element={<ClientRedirect />} />
                  <Route path="/documents" element={<Documents />} />
                  <Route path="/engagements" element={<Engagements />} />
                  <Route path="/engagements/portfolio" element={<EngagementPortfolio />} />
                  <Route path="/engagements/:id/letter" element={<EngagementLetterPage />} />
                  <Route path="/engagements/:id" element={<EngagementDetail />} />
                  <Route path="/engagements/workflow" element={<Navigate to="/engagements" replace />} />
                  <Route path="/workflow" element={<Navigate to="/engagements" replace />} />
                  <Route path="/services" element={<ServiceCatalog />} />
                  <Route path="/workpapers" element={<Workpapers />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/observations" element={<Navigate to="/reports?tab=observations" replace />} />
                  <Route path="/form3cd" element={<Navigate to="/reports?tab=form3cd" replace />} />
                  <Route path="/time-billing" element={<Navigate to="/time-tracker" replace />} />
                  <Route path="/time-tracker" element={<TimeTracker />} />
                  <Route path="/leave-stipend" element={<LeaveStipend />} />
                  <Route path="/messages" element={<Messages />} />
                  <Route path="/employees" element={<Employees />} />
                  <Route path="/clients" element={<Clients />} />
                  <Route path="/requests" element={<PendingRequests />} />
                  <Route path="/requests/:id" element={<RequestDetail />} />
                  <Route path="/document-library" element={<DocumentLibraryTemplates />} />
                  <Route path="/admin/scheduler" element={<SchedulerAdmin />} />
                  <Route path="/compliance-calendar" element={<ComplianceCalendarPage />} />
                  <Route path="/billing/pending" element={<BillingPending />} />
                  <Route path="/timesheets" element={<Timesheets />} />
                  <Route path="/notices" element={<NoticesDashboard />} />
                  <Route path="/notices/:id" element={<NoticeDetail />} />
                  <Route path="/portals/credentials" element={<Navigate to="/vault" replace />} />
                  <Route path="/staff/:id/schedule" element={<StaffSchedulePage />} />
                  <Route path="/claims/pending" element={<ClaimsPending />} />
                  <Route path="/claims/new/late-hours" element={<LateHoursClaimForm />} />
                  <Route path="/claims/new/dept-visit" element={<DeptVisitClaimForm />} />
                  <Route path="/claims" element={<ClaimsHub />} />
                  <Route path="/claims/new/:claimType" element={<NewStaffClaimForm />} />
                  <Route path="/claims/batches" element={<ClaimBatchesPage />} />
                  <Route path="/expenses" element={<Navigate to="/claims" replace />} />
                  <Route path="/expenses/*" element={<Navigate to="/claims" replace />} />
                  <Route path="/client-master" element={<Navigate to="/clients" replace />} />
                  <Route path="/onboarding" element={<Navigate to="/clients?tab=incoming" replace />} />
                  <Route path="/approvals" element={<Approvals />} />
                  <Route path="/vault" element={<PasswordVault />} />
                  <Route path="/billing" element={<Billing />} />
                  <Route path="/management-reports" element={<ManagementReports />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/audit-log" element={<Navigate to="/settings?tab=audit-log" replace />} />
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
        </AppDialogProvider>
        </AppToastProvider>
        </AttendanceConfirmationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
