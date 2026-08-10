import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useClientPortal } from './ClientPortalContext';

export function ClientPortalQueriesTab() {
  const {
    auditQueriesError,
    querySubmitError,
    engagements,
    newQuery,
    setNewQuery,
    querySubmitting,
    submitAuditQuery,
    auditQueries,
  } = useClientPortal();

  return (
    <div className="mt-4 space-y-4">
      {auditQueriesError && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {auditQueriesError}
          <p className="text-xs text-muted-foreground mt-1">
            Your firm may need to run a database update. Contact your audit team if this persists.
          </p>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>New audit query</CardTitle>
          <CardDescription>Structured questions for your engagement team</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-w-lg">
          {querySubmitError && <p className="text-sm text-danger">{querySubmitError}</p>}
          <select
            className="input-field w-full"
            aria-label="Engagement"
            value={newQuery.engagementId}
            onChange={(e) => setNewQuery((p) => ({ ...p, engagementId: e.target.value }))}
          >
            <option value="">Select engagement</option>
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <input
            className="input-field w-full"
            aria-label="Subject"
            placeholder="Subject"
            value={newQuery.subject}
            onChange={(e) => setNewQuery((p) => ({ ...p, subject: e.target.value }))}
          />
          <textarea
            className="input-field w-full"
            aria-label="Question"
            rows={3}
            placeholder="Describe your question…"
            value={newQuery.body}
            onChange={(e) => setNewQuery((p) => ({ ...p, body: e.target.value }))}
          />
          <Button
            onClick={() => void submitAuditQuery()}
            disabled={querySubmitting || !newQuery.engagementId || !newQuery.subject || !newQuery.body}
          >
            {querySubmitting ? 'Submitting…' : 'Submit query'}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your queries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {auditQueries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No queries yet.</p>
          ) : (
            auditQueries.map((q) => (
              <div key={q.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{q.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {q.engagementName} · {q.status}
                </p>
                <p className="mt-2 text-foreground-secondary">{q.body}</p>
                {q.response && (
                  <div className="mt-2 p-2 rounded bg-primary-light/50 text-foreground">
                    <p className="text-xs font-medium text-primary">Firm response</p>
                    <p className="text-sm mt-1">{q.response}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
