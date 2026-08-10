import { Link, useNavigate } from 'react-router-dom';
import { ShieldSlash as ShieldX } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import PageHeader from '@/components/layout/PageHeader';
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
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5"
          aria-hidden
        >
          <ShieldX className="h-8 w-8 text-destructive" weight="duotone" />
        </div>
        <PageHeader
          title="Access denied"
          description="You don't have permission to view this page. If you need access, ask your firm administrator to update your role or permissions."
          className="justify-center text-center [&_h1]:text-2xl"
        />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
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
        <p className="mt-8 text-xs text-muted-foreground">
          Signed in as {user?.email ?? 'unknown user'}
        </p>
      </div>
    </AppPageContainer>
  );
}
