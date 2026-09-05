import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CaretDown as ChevronDown } from '@phosphor-icons/react';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PanelCard } from '@/components/layout/PanelCard';
import PageHeader from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { ErrorBanner } from '@/components/layout/ErrorBanner';
import PageLoading from '@/components/layout/PageLoading';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClaimStaffTimeline } from '@/components/claims/ClaimStaffTimeline';
import { ClaimProgressStepper } from '@/components/claims/ClaimProgressStepper';
import {
  CLAIM_STATUS_LABELS,
  CLAIM_TYPE_LABELS,
  claimStatusBadgeVariant,
  engagementHeaderLine,
  formatInr,
  type StaffClaimRow,
} from '@/lib/expenseClaims';
import { formatApiError } from '@/lib/apiErrors';

export default function ClaimsHub() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<StaffClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const canApprove = ['Partner', 'Admin', 'Manager'].includes(user?.role ?? '');
  const canSubmitClaim = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'].includes(user?.role ?? '');
  const isAccounts = user?.role === 'Accounts';

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    void api
      .get<{ claims: StaffClaimRow[] }>('/expense-claims/mine')
      .then((r) => setClaims(r.data.claims))
      .catch((e) => setLoadError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppPageContainer>
      <PageHeader
        title="Claims"
        actions={
          <div className="flex flex-wrap gap-2">
            {canSubmitClaim && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    New claim
                    <ChevronDown className="ml-1 size-3.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link to="/claims/new/food">Food</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/claims/new/travel">Travel</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/claims/new/late-hours">Late hours</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/claims/new/dept-visit">Dept visit</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canApprove && (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link to="/approvals">Approvals</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/claims/pending">Attendance claims</Link>
                </Button>
              </>
            )}
            {(isAccounts || ['Partner', 'Admin'].includes(user?.role ?? '')) && (
              <Button asChild size="sm" variant="outline">
                <Link to="/claims/batches">Batches</Link>
              </Button>
            )}
          </div>
        }
      />
      <PanelCard title="My claims">
        {loading ? (
          <PageLoading className="py-12" label="Loading claims…" />
        ) : loadError ? (
          <ErrorBanner message={loadError} onRetry={load} />
        ) : claims.length === 0 ? (
          <EmptyState title="No claims yet" />
        ) : (
          <ul className="space-y-4">
            {claims.map((c) => (
              <li key={c.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">
                      {CLAIM_TYPE_LABELS[c.claimType]} · {formatInr(c.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{engagementHeaderLine(c)}</p>
                    {c.claimStatus === 'partially_approved' && c.approvedAmount != null && (
                      <p className="text-xs text-muted-foreground">Approved {formatInr(c.approvedAmount)}</p>
                    )}
                  </div>
                  <Badge variant={claimStatusBadgeVariant(c.claimStatus)}>
                    {CLAIM_STATUS_LABELS[c.claimStatus] ?? c.claimStatus}
                  </Badge>
                </div>
                <ClaimProgressStepper claim={c} audience="staff" />
                <ClaimStaffTimeline claim={c} />
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </AppPageContainer>
  );
}
