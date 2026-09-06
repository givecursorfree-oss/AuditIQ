import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NavCountBadge } from '@/components/ui/nav-count-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ClientActivationNotice from '@/components/engagement/ClientActivationNotice';
import {
  Briefcase,
  CalendarBlank as CalendarClock,
  CaretDown as ChevronDown,
  CheckCircle,
  Clock,
} from '@phosphor-icons/react';
import PageLoading from '@/components/layout/PageLoading';
import { EmptyState } from '@/components/layout/EmptyState';
import { ClientPortalProvider, useClientPortal } from '@/components/client-portal/ClientPortalContext';
import { ClientPortalHeader } from '@/components/client-portal/ClientPortalHeader';
import { ClientPortalTrackingTab } from '@/components/client-portal/ClientPortalTrackingTab';
import { ClientPortalEngagementsTab } from '@/components/client-portal/ClientPortalEngagementsTab';
import { ClientPortalDocumentsTab } from '@/components/client-portal/ClientPortalDocumentsTab';
import { ClientPortalRequestsTab } from '@/components/client-portal/ClientPortalRequestsTab';
import { ClientPortalInvoicesTab } from '@/components/client-portal/ClientPortalInvoicesTab';
import { ClientPortalReportsTab } from '@/components/client-portal/ClientPortalReportsTab';
import { ClientPortalQueriesTab } from '@/components/client-portal/ClientPortalQueriesTab';
import { ClientPortalNotificationsTab } from '@/components/client-portal/ClientPortalNotificationsTab';
import { ClientPortalPriorities } from '@/components/client-portal/ClientPortalPriorities';
import { ClientPortalLetterModal } from '@/components/client-portal/ClientPortalLetterModal';
import { ClientPortalRequestModal } from '@/components/client-portal/ClientPortalRequestModal';

const MORE_TABS = [
  { value: 'engagements', label: 'Engagements' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'reports', label: 'Reports' },
  { value: 'alerts', label: 'Alerts' },
] as const;

function ClientPortalDashboard() {
  const {
    loading,
    profile,
    hasDashboardContent,
    activeTab,
    setActiveTab,
    engagements,
    activeCount,
    completedCount,
    pendingRequests,
    pendingActivationEngagements,
    pendingDocsCount,
    openAuditQueryCount,
    pendingServiceRequests,
    pendingLetters,
  } = useClientPortal();

  if (loading) {
    return <PageLoading className="py-20" />;
  }

  if (!profile?.clientId) {
    return (
      <EmptyState
        className="max-w-lg mx-auto mt-12"
        title="Account not linked"
        description="Contact your CA firm to enable portal access."
        illustration="person-wait"
      />
    );
  }

  const moreActive = MORE_TABS.some((t) => t.value === activeTab);
  const moreLabel = MORE_TABS.find((t) => t.value === activeTab)?.label ?? 'More';

  return (
    <div className="space-y-6 animate-fade-in">
      <ClientPortalHeader />

      {hasDashboardContent && (
        <>
          <ClientPortalPriorities />

          {pendingActivationEngagements.length > 0 && (
            <ClientActivationNotice
              engagementName={
                pendingActivationEngagements.length === 1
                  ? pendingActivationEngagements[0].name
                  : undefined
              }
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-foreground-secondary">
                  Your engagements
                </CardTitle>
                <Briefcase className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{engagements.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Assigned to {profile.clientName}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-foreground-secondary">In progress</CardTitle>
                <Clock className="h-5 w-5 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{activeCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-foreground-secondary">Completed</CardTitle>
                <CheckCircle className="h-5 w-5 text-success" weight="fill" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{completedCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-foreground-secondary">Pending uploads</CardTitle>
                <CalendarClock className="h-5 w-5 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">{pendingRequests}</div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="bg-card border border-border p-1 h-auto flex-wrap gap-1">
              <TabsTrigger value="tracking" data-onboard="client-tab-tracking" className="gap-1.5">
                Progress
                <NavCountBadge
                  count={
                    pendingActivationEngagements.length +
                    pendingDocsCount +
                    openAuditQueryCount +
                    pendingLetters.length
                  }
                  className="ml-0"
                />
              </TabsTrigger>
              <TabsTrigger value="documents" data-onboard="client-tab-documents" className="gap-1.5">
                Documents
                <NavCountBadge count={pendingDocsCount} className="ml-0" />
              </TabsTrigger>
              <TabsTrigger value="queries" data-onboard="client-tab-queries" className="gap-1.5">
                Queries
                <NavCountBadge count={openAuditQueryCount} className="ml-0" />
              </TabsTrigger>
              <TabsTrigger value="requests" className="gap-1.5">
                Requests
                <NavCountBadge
                  count={pendingServiceRequests.length + pendingLetters.length}
                  className="ml-0"
                />
              </TabsTrigger>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={moreActive ? 'secondary' : 'ghost'}
                    className="h-8 gap-1 px-3"
                  >
                    {moreLabel}
                    <ChevronDown size={14} className="opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {MORE_TABS.map((t) => (
                    <DropdownMenuItem key={t.value} onSelect={() => setActiveTab(t.value)}>
                      {t.label}
                      {t.value === 'engagements' && pendingActivationEngagements.length > 0
                        ? ` (${pendingActivationEngagements.length})`
                        : ''}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </TabsList>

            <TabsContent value="tracking">
              <ClientPortalTrackingTab />
            </TabsContent>
            <TabsContent value="engagements">
              <ClientPortalEngagementsTab />
            </TabsContent>
            <TabsContent value="documents">
              <ClientPortalDocumentsTab />
            </TabsContent>
            <TabsContent value="requests">
              <ClientPortalRequestsTab />
            </TabsContent>
            <TabsContent value="invoices">
              <ClientPortalInvoicesTab />
            </TabsContent>
            <TabsContent value="reports">
              <ClientPortalReportsTab />
            </TabsContent>
            <TabsContent value="queries">
              <ClientPortalQueriesTab />
            </TabsContent>
            <TabsContent value="alerts">
              <ClientPortalNotificationsTab />
            </TabsContent>
          </Tabs>
        </>
      )}

      <ClientPortalLetterModal />
      <ClientPortalRequestModal />
    </div>
  );
}

export default function ClientPortal() {
  return (
    <ClientPortalProvider>
      <ClientPortalDashboard />
    </ClientPortalProvider>
  );
}
