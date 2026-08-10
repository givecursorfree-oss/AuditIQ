import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Timeline } from '@/components/ui/timeline';
import ClientActivationNotice from '@/components/engagement/ClientActivationNotice';
import { CaretRight, ChartLineUp } from '@phosphor-icons/react';
import { useClientPortal } from './ClientPortalContext';
import { stageToTimelineItems, statusBadgeVariant } from './utils';

export function ClientPortalTrackingTab() {
  const {
    engagements,
    selectedEngagementId,
    setSelectedEngagementId,
    selectedEngagement,
    timelineStages,
    timelineLoading,
    engagementDetail,
    detailLoading,
    checklistUploading,
    handleChecklistUpload,
    reportQueryText,
    setReportQueryText,
    acknowledgeEngagementReport,
    submitEngagementReportQuery,
  } = useClientPortal();

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ChartLineUp size={18} className="text-primary" />
              Select engagement
            </CardTitle>
            <CardDescription>Only engagements for your organisation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {engagements.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No engagements yet.</p>
            ) : (
              engagements.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelectedEngagementId(e.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-all ${
                    selectedEngagementId === e.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card hover:bg-hover-bg'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground text-sm truncate">{e.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {e.type} · FY {e.assessmentYear}
                      </p>
                    </div>
                    <CaretRight
                      size={16}
                      className={`shrink-0 mt-0.5 ${
                        selectedEngagementId === e.id ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    />
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${e.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">{e.currentStage}</p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {selectedEngagement ? selectedEngagement.name : 'Workflow timeline'}
            </CardTitle>
            {selectedEngagement && (
              <CardDescription className="flex flex-wrap items-center gap-2">
                <Badge variant={statusBadgeVariant(selectedEngagement.status)}>
                  {selectedEngagement.status}
                </Badge>
                <span className="text-muted-foreground">
                  Current: <strong className="text-foreground">{selectedEngagement.currentStage}</strong>
                </span>
                {selectedEngagement.deadline && (
                  <span className="text-muted-foreground">
                    · Due {new Date(selectedEngagement.deadline).toLocaleDateString('en-IN')}
                  </span>
                )}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {timelineLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : timelineStages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Select an engagement to view its audit workflow.
              </p>
            ) : (
              <Timeline
                items={stageToTimelineItems(timelineStages)}
                variant="default"
                timestampPosition="inline"
                showTimestamps
              />
            )}
          </CardContent>
        </Card>
      </div>

      {engagementDetail && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement details</CardTitle>
            <CardDescription>
              Ref: {engagementDetail.referenceNo} · Submitted{' '}
              {new Date(engagementDetail.submittedAt).toLocaleDateString('en-IN')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {detailLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <p className="text-sm text-foreground-secondary">{engagementDetail.stageDescription}</p>
                {!engagementDetail.isActivated && (
                  <ClientActivationNotice variant="compact" engagementName={engagementDetail.name} />
                )}

                {engagementDetail.checklist && engagementDetail.checklist.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Document checklist</h4>
                    <ul className="space-y-2">
                      {engagementDetail.checklist.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                        >
                          <span className="text-foreground">{item.title}</span>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                item.status === 'Uploaded' || item.status === 'Verified'
                                  ? 'success'
                                  : item.status === 'Revision Required'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                            >
                              {item.status === 'Uploaded'
                                ? 'Uploaded'
                                : item.status === 'Verified'
                                  ? 'Verified'
                                  : item.status === 'Revision Required'
                                    ? 'Revision required'
                                    : 'Pending'}
                            </Badge>
                            {item.status === 'Revision Required' && item.revisionNotes && (
                              <p className="w-full text-xs text-warning mt-1">{item.revisionNotes}</p>
                            )}
                            {engagementDetail.isActivated &&
                              item.status !== 'Uploaded' &&
                              item.status !== 'Verified' && (
                                <label className="cursor-pointer">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={checklistUploading === item.id}
                                    asChild
                                  >
                                    <span>{checklistUploading === item.id ? 'Uploading…' : 'Upload'}</span>
                                  </Button>
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
                                    onChange={(ev) => handleChecklistUpload(item.id, ev)}
                                  />
                                </label>
                              )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {engagementDetail.sharedReports && engagementDetail.sharedReports.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Reports shared with you</h4>
                    <ul className="space-y-3">
                      {engagementDetail.sharedReports.map((r) => (
                        <li key={r.id} className="rounded-lg border border-border px-3 py-3 text-sm space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{r.title}</span>
                            <Badge variant="outline">{r.status}</Badge>
                          </div>
                          {r.acknowledgedAt ? (
                            <p className="text-xs text-success">
                              Acknowledged {new Date(r.acknowledgedAt).toLocaleDateString('en-IN')}
                            </p>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void acknowledgeEngagementReport(r.id, engagementDetail.id)}
                            >
                              Acknowledge receipt
                            </Button>
                          )}
                          {r.clientQuery ? (
                            <p className="text-xs text-muted-foreground">Your query: {r.clientQuery}</p>
                          ) : (
                            <div className="flex gap-2">
                              <input
                                className="input-field flex-1 text-xs"
                                aria-label="Raise a query on this report"
                                placeholder="Raise a query on this report…"
                                value={reportQueryText[r.id] ?? ''}
                                onChange={(e) =>
                                  setReportQueryText((p) => ({ ...p, [r.id]: e.target.value }))
                                }
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  void submitEngagementReportQuery(r.id, engagementDetail.id)
                                }
                              >
                                Submit
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {engagementDetail.invoices && engagementDetail.invoices.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Invoices</h4>
                    <ul className="space-y-2">
                      {engagementDetail.invoices.map((inv) => (
                        <li
                          key={inv.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                        >
                          <span>
                            {inv.number} · ₹{Number(inv.amount).toLocaleString('en-IN')}
                          </span>
                          <Badge variant={inv.status === 'Paid' ? 'success' : 'secondary'}>
                            {inv.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
