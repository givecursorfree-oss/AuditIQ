import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RequestStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import {
  Buildings,
  Clock,
  FileText,
  Plus,
} from '@phosphor-icons/react';
import { useClientPortal } from './ClientPortalContext';

export function ClientPortalHeader() {
  const {
    user,
    profile,
    pendingLetters,
    lettersInPreparation,
    pendingServiceRequests,
    hasDashboardContent,
    openRequestForm,
    openLetterReview,
    setActiveTab,
  } = useClientPortal();

  if (!profile) return null;

  return (
    <>
      <div
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        data-onboard="client-portal-header"
      >
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Buildings size={16} />
            <span>{profile.firmName ?? 'Your CA Firm'}</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{profile.clientName}</h1>
          <p className="text-muted-foreground mt-1">
            Hi {user?.firstName} — your engagements and documents with {profile.firmName ?? 'the firm'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {profile.legalName && profile.legalName !== profile.clientName && (
            <Badge variant="outline">{profile.legalName}</Badge>
          )}
          <Button onClick={openRequestForm} variant="default" size="sm" data-onboard="client-request-engagement">
            <Plus size={16} className="mr-1.5" />
            Request New Engagement
          </Button>
        </div>
      </div>

      {lettersInPreparation.length > 0 && pendingLetters.length === 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Engagement letter in preparation
            </CardTitle>
            <CardDescription>
              Your request was approved. {profile.firmName ?? 'Your CA firm'} is preparing your engagement
              letter — it will appear here when ready for you to <strong>review and sign</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {lettersInPreparation.slice(0, 3).map((eng) => (
              <div key={eng.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <p className="font-medium text-foreground">{eng.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">FY {eng.financialYear} · Being prepared</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {pendingLetters.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Engagement letter — action required</CardTitle>
            <CardDescription>
              Your engagement letter has been sent to this dashboard. Please review it and sign so your CA firm
              can assign your team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingLetters.map((letter) => (
              <div
                key={letter.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div>
                  <p className="font-medium text-foreground">{letter.engagement.title}</p>
                  <p className="text-xs text-muted-foreground">
                    FY {letter.engagement.financialYear}
                    {letter.sentAt && ` · Sent ${new Date(letter.sentAt).toLocaleDateString('en-IN')}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void openLetterReview(letter.id)}>
                    Review & sign
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {pendingServiceRequests.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              {pendingServiceRequests.length === 1
                ? 'Service request under review'
                : `${pendingServiceRequests.length} service requests under review`}
            </CardTitle>
            <CardDescription>
              Your CA firm is reviewing your request(s). After approval, an <strong>engagement letter</strong>{' '}
              will appear on this dashboard — please review it and sign so your team can be assigned.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingServiceRequests.slice(0, 3).map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <p className="font-medium text-foreground">
                  {(r.serviceLabels ?? r.selectedServices).join(' · ')} — FY {r.financialYears.join(', ')}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Submitted {new Date(r.submittedAt).toLocaleString('en-IN')}</span>
                  <RequestStatusBadge status={r.status} />
                </p>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setActiveTab('requests')}>
              View all requests
            </Button>
          </CardContent>
        </Card>
      )}

      {!hasDashboardContent && (
        <Card className="border-dashed" data-onboard="client-empty-welcome">
          <CardContent className="py-16 text-center space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Welcome, {user?.firstName} 👋</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Submit your first service request. Your CA firm will review it, send an engagement letter to this
              dashboard for your signature, and then assign your team.
            </p>
            <Button onClick={openRequestForm} size="lg" className="mt-2">
              <Plus size={18} className="mr-2" />
              Request a New Engagement
            </Button>
            <p className="text-xs text-muted-foreground pt-4">
              After you submit, track status here — including when your engagement letter is ready to sign.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
