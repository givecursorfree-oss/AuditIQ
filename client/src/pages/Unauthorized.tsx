import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { EmptyState } from '@/components/layout/EmptyState';
import AuditIQLogo from '@/components/brand/AuditIQLogo';

export default function Unauthorized() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const home = user?.role === 'Client' ? '/client/dashboard' : '/';
  const homeLabel = user?.role === 'Client' ? 'Client portal' : 'Dashboard';

  return (
    <AppPageContainer className="py-8 sm:py-12">
      <div className="mx-auto flex max-w-lg flex-col items-center text-center">
        <AuditIQLogo className="mb-6 h-10 w-auto object-contain opacity-90" />
        <EmptyState
          title="Access denied"
          description="You don't have permission to view this page. Ask your firm administrator to update your role or permissions."
          illustration="person-lock"
          className="py-4"
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="outline" onClick={() => navigate(-1)}>
                Go back
              </Button>
              <Button onClick={() => navigate(home, { replace: true })}>{homeLabel}</Button>
              {['Partner', 'Admin'].includes(user?.role ?? '') && (
                <Button variant="secondary" asChild>
                  <Link to="/settings?tab=roles">Manage roles</Link>
                </Button>
              )}
            </div>
          }
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Signed in as {user?.email ?? 'unknown user'}
        </p>
      </div>
    </AppPageContainer>
  );
}
