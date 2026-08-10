import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { canAccessRoute } from '../../lib/navAccess';

/**
 * Blocks routes the user's role/permissions cannot access (from navCatalog).
 */
export default function RouteGuard() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <output
        className="flex items-center justify-center py-20 list-none"
        aria-live="polite"
        aria-label="Loading page"
      >
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden />
      </output>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  const path = location.pathname.replace(/\/$/, '') || '/';
  if (user.role === 'Client' && path === '/') {
    return <Navigate to="/client/dashboard" replace />;
  }

  if (!canAccessRoute(user, location.pathname, location.search)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
