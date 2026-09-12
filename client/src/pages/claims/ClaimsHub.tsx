import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClaimStaffTimeline } from '@/components/claims/ClaimStaffTimeline';
import { ClaimProgressStepper } from '@/components/claims/ClaimProgressStepper';
import { ClaimsApprovalInbox } from '@/components/claims/ClaimsApprovalInbox';
import ClaimsPending from '@/pages/claims/ClaimsPending';
import ClaimBatchesPage from '@/pages/claims/ClaimBatchesPage';
import {
  CLAIM_STATUS_LABELS,
  CLAIM_TYPE_LABELS,
  claimStatusBadgeVariant,
  engagementHeaderLine,
  formatInr,
  type StaffClaimRow,
} from '@/lib/expenseClaims';
import { formatApiError } from '@/lib/apiErrors';

type ClaimsTab = 'mine' | 'approvals' | 'attendance' | 'batches';

function parseClaimsTab(raw: string | null, canApprove: boolean, canBatches: boolean): ClaimsTab {
  if (raw === 'approvals' && canApprove) return 'approvals';
  if (raw === 'attendance' && canApprove) return 'attendance';
  if (raw === 'batches' && canBatches) return 'batches';
  return 'mine';
}

export default function ClaimsHub() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [claims, setClaims] = useState<StaffClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const canApprove = ['Partner', 'Admin', 'Manager'].includes(user?.role ?? '');
  const canSubmitClaim = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'].includes(user?.role ?? '');
  const canBatches =
    user?.role === 'Accounts' || ['Partner', 'Admin', 'Manager'].includes(user?.role ?? '');

  const tab = useMemo(
    () => parseClaimsTab(searchParams.get('tab'), canApprove, canBatches),
    [searchParams, canApprove, canBatches]
  );

  const setTab = (next: ClaimsTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'mine') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

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
    if (tab === 'mine') load();
  }, [load, tab]);

  return (
    <AppPageContainer>
      <PageHeader
        title="Claims"
        actions={
          canSubmitClaim ? (
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
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as ClaimsTab)} className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="mine">Mine</TabsTrigger>
          {canApprove && <TabsTrigger value="approvals">Food–Travel</TabsTrigger>}
          {canApprove && <TabsTrigger value="attendance">Attendance</TabsTrigger>}
          {canBatches && <TabsTrigger value="batches">Batches</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine">
          <PanelCard title="My claims">
            {loading ? (
              <PageLoading className="py-12" label="Loading claims…" />
            ) : loadError ? (
              <ErrorBanner message={loadError} onRetry={load} />
            ) : claims.length === 0 ? (
              <EmptyState
                title="No claims yet"
                description="Food, travel, late hours, and dept visit claims you submit will show here."
                illustration="person-wait"
              />
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
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={claimStatusBadgeVariant(c.claimStatus)}>
                          {CLAIM_STATUS_LABELS[c.claimStatus] ?? c.claimStatus}
                        </Badge>
                        <Button size="sm" variant="outline" className="h-7" asChild>
                          <Link to={`/claims/detail/${c.id}`}>Open</Link>
                        </Button>
                      </div>
                    </div>
                    <ClaimProgressStepper claim={c} audience="staff" />
                    <ClaimStaffTimeline claim={c} />
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>
        </TabsContent>

        {canApprove && (
          <TabsContent value="approvals">
            <ClaimsApprovalInbox />
          </TabsContent>
        )}

        {canApprove && (
          <TabsContent value="attendance">
            <ClaimsPending embedded />
          </TabsContent>
        )}

        {canBatches && (
          <TabsContent value="batches">
            <ClaimBatchesPage embedded />
          </TabsContent>
        )}
      </Tabs>
    </AppPageContainer>
  );
}
