import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NavCountBadge } from '@/components/ui/nav-count-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ClientActivationNotice from '@/components/engagement/ClientActivationNotice';
import {
  Briefcase,
  CalendarBlank as CalendarClock,
  CheckCircle,
  Clock,
  WarningCircle as AlertCircle,
} from '@phosphor-icons/react';
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
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile?.clientId) {
    return (
      <Card className="max-w-lg mx-auto mt-12">
        <CardContent className="py-10 text-center space-y-3">
          <AlertCircle size={40} className="mx-auto text-warning" />
          <h2 className="text-lg font-semibold text-foreground">Account not linked</h2>
          <p className="text-sm text-muted-foreground">
            Your login is not linked to a client record. Please contact your CA firm to enable portal access.
          </p>
        </CardContent>
      </Card>
    );
  }

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
            <TabsList className="bg-card border border-border p-1 h-auto flex-wrap">
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
              <TabsTrigger value="engagements" className="gap-1.5">
                Engagements
                <NavCountBadge count={pendingActivationEngagements.length} className="ml-0" />
              </TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="settings">Alerts</TabsTrigger>
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
            <TabsContent value="settings">
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
