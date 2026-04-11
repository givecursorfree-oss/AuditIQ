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
        <div className="h-screen flex items-center justify-center bg-white">
          <div className="text-center space-y-4">
            <img src="/logo.png" alt="AuditIQ" className="h-14 w-auto mx-auto object-contain" />
            <h2 className="text-lg font-semibold text-gray-800">Something went wrong</h2>
            <p className="text-sm text-gray-500">Please refresh the page to continue.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
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
            </Route>

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="/engagements" element={<Engagements />} />
                <Route path="/workpapers" element={<Workpapers />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/copilot" element={<Copilot />} />
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
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
