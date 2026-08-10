import { useCallback, useEffect, useState } from 'react';
import { ChatCircle, CheckCircle, XCircle } from '@phosphor-icons/react';
import api from '../../services/api';
import { Button } from '../ui/button';
import { isReportDerivedQuery } from '../../lib/clientAuditQuery';

export interface ClientAuditQueryRow {
  id: string;
  subject: string;
  body: string;
  status: string;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  engagementId: string;
  engagement: { id: string; title: string };
  client: { id: string; name: string };
  createdBy: { firstName: string; lastName: string; email: string };
  respondedBy?: { firstName: string; lastName: string } | null;
}

interface Props {
  engagementId: string;
  canRespond: boolean;
}

export default function ClientAuditQueriesPanel({ engagementId, canRespond }: Props) {
  const [queries, setQueries] = useState<ClientAuditQueryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get<ClientAuditQueryRow[]>('/client-queries', {
        params: { engagementId },
      });
      setQueries(res.data);
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      setLoadError(ax.response?.data?.error || 'Could not load client queries');
      setQueries([]);
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = queries.filter((q) => q.status === 'Open').length;

  async function submitResponse(queryId: string) {
    const response = (draftById[queryId] ?? '').trim();
    if (!response) return;
    setBusyId(queryId);
    setFeedback(null);
    try {
      await api.patch(`/client-queries/${queryId}/respond`, { response, status: 'Answered' });
      setDraftById((p) => ({ ...p, [queryId]: '' }));
      setFeedback('Response sent. The client is notified in their portal.');
      await load();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      setFeedback(ax.response?.data?.error || 'Failed to send response');
    } finally {
      setBusyId(null);
    }
  }

  async function closeQuery(queryId: string) {
    setBusyId(`close-${queryId}`);
    setFeedback(null);
    try {
      await api.patch(`/client-queries/${queryId}/close`);
      setFeedback('Query marked closed.');
      await load();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      setFeedback(ax.response?.data?.error || 'Failed to close query');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="text-sm text-foreground-muted py-6 text-center">Loading client queries…</div>;
  }

  if (loadError) {
    return (
      <div className="card p-4 space-y-3">
        <p className="text-sm text-danger">{loadError}</p>
        <p className="text-xs text-foreground-muted">
          If this is a new install, run <code className="text-xs">npm run db:push</code> or apply Prisma migrations so the ClientAuditQuery table exists.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground-muted">
          Questions submitted from the client portal for this engagement.
          {openCount > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
              {openCount} open
            </span>
          )}
        </p>
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {feedback && (
        <p className="text-sm text-foreground-secondary rounded-lg border border-border bg-surface-muted px-3 py-2">
          {feedback}
        </p>
      )}

      {queries.length === 0 ? (
        <div className="card p-8 text-center text-sm text-foreground-muted">
          <ChatCircle size={32} className="mx-auto mb-2 text-foreground-muted" />
          No client audit queries for this engagement yet.
        </div>
      ) : (
        <div className="space-y-3">
          {queries.map((q) => (
            <article key={q.id} className="card p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{q.subject}</h3>
                    {isReportDerivedQuery(q.subject) && (
                      <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-muted text-foreground-muted">
                        From report
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted mt-0.5">
                    {q.client.name} · {new Date(q.createdAt).toLocaleString('en-IN')} ·{' '}
                    {q.createdBy.firstName} {q.createdBy.lastName}
                  </p>
                </div>
                <QueryStatusBadge status={q.status} />
              </div>
              <p className="text-sm text-foreground-secondary whitespace-pre-wrap">{q.body}</p>

              {q.response && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs font-medium text-primary">Firm response</p>
                  <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{q.response}</p>
                  {q.respondedAt && (
                    <p className="text-xs text-foreground-muted mt-2">
                      {new Date(q.respondedAt).toLocaleString('en-IN')}
                      {q.respondedBy && (
                        <> · {q.respondedBy.firstName} {q.respondedBy.lastName}</>
                      )}
                    </p>
                  )}
                </div>
              )}

              {q.status === 'Open' && canRespond && (
                <div className="space-y-2 border-t border-border pt-3">
                  <label htmlFor={`audit-query-reply-${q.id}`} className="block text-xs font-medium text-foreground-muted">
                    Reply to client
                  </label>
                  <textarea
                    id={`audit-query-reply-${q.id}`}
                    aria-label="Reply to client"
                    className="input-field w-full"
                    rows={3}
                    placeholder="Write your response…"
                    value={draftById[q.id] ?? ''}
                    onChange={(e) => setDraftById((p) => ({ ...p, [q.id]: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === q.id || !(draftById[q.id] ?? '').trim()}
                      onClick={() => void submitResponse(q.id)}
                    >
                      <CheckCircle size={16} className="mr-1" />
                      Send response
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busyId === `close-${q.id}`}
                      onClick={() => void closeQuery(q.id)}
                    >
                      <XCircle size={16} className="mr-1" />
                      Close without reply
                    </Button>
                  </div>
                </div>
              )}

              {q.status === 'Open' && !canRespond && (
                <p className="text-xs text-foreground-muted border-t border-border pt-2">
                  Only users with engagement edit access can respond.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function QueryStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'Open'
      ? 'bg-warning/15 text-warning'
      : status === 'Answered'
        ? 'bg-success/15 text-success'
        : 'bg-surface-muted text-foreground-muted';
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${tone}`}>{status}</span>;
}
