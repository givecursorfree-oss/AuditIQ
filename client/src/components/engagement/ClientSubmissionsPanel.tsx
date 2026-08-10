import { useState } from 'react';
import {
  DownloadSimple,
  PaperPlaneTilt,
  ArrowSquareIn,
  ArrowsClockwise,
  Eye,
  FileText,
  ChatCircle,
  CaretDown,
  X,
} from '@phosphor-icons/react';
import api from '../../services/api';
import DocumentPdfPreview from '../DocumentPdfPreview';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { PanelCard } from '../layout/PanelCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { cn } from '@/lib/utils';

export interface SubmissionDocument {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  folder: string;
  category: string | null;
  createdAt: string;
  uploadedByName: string;
  previewUrl: string;
  downloadUrl: string;
}

export interface ChecklistItemWithSubmission {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  requestedAt: string;
  receivedAt?: string | null;
  revisionNotes?: string | null;
  revisionRequestedAt?: string | null;
  followupCount: number;
  submission: SubmissionDocument | null;
}

export interface ChecklistPayload {
  engagementRequest: { scope: string; submittedAt: string; clientName: string } | null;
  items: ChecklistItemWithSubmission[];
  clientUploads: SubmissionDocument[];
}

interface Props {
  data: ChecklistPayload | null;
  onReload: () => void;
  canManage: boolean;
  hideClientUploadsList?: boolean;
  filesListedAbove?: boolean;
}

type ExpandedPanel = 'message' | 'revision' | 'file' | null;

function effectiveStatus(item: ChecklistItemWithSubmission): string {
  if (item.status === 'Received' && !item.submission) {
    return 'Received (no file)';
  }
  return item.status;
}

function shortStatus(item: ChecklistItemWithSubmission): string {
  const s = effectiveStatus(item);
  if (s === 'Missing') return 'Missing';
  if (s.startsWith('Received')) return item.submission ? 'Received' : 'No file';
  if (s === 'Revision Required') return 'Revision';
  return s;
}

export default function ClientSubmissionsPanel({
  data,
  onReload,
  canManage,
  hideClientUploadsList,
  filesListedAbove,
}: Props) {
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [messageByItem, setMessageByItem] = useState<Record<string, string>>({});
  const [revisionByItem, setRevisionByItem] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'missing' | 'received'>('all');

  if (!data) {
    return (
      <div className="flex justify-center py-12">
        <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  function togglePanel(itemId: string, panel: ExpandedPanel) {
    if (expandedId === itemId && expandedPanel === panel) {
      setExpandedId(null);
      setExpandedPanel(null);
      return;
    }
    setExpandedId(itemId);
    setExpandedPanel(panel);
  }

  async function sendMessage(itemId: string) {
    const message = (messageByItem[itemId] ?? '').trim();
    if (!message) return;
    setBusy(`msg-${itemId}`);
    setFeedback(null);
    try {
      await api.post(`/data-checklist/item/${itemId}/message-client`, { message });
      setMessageByItem((p) => ({ ...p, [itemId]: '' }));
      setFeedback('Message sent to client chat.');
      setExpandedId(null);
      setExpandedPanel(null);
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      setFeedback(ax.response?.data?.error || 'Failed to send message');
    } finally {
      setBusy(null);
    }
  }

  async function requestRevision(itemId: string) {
    const notes = (revisionByItem[itemId] ?? '').trim();
    if (!notes) return;
    setBusy(`rev-${itemId}`);
    setFeedback(null);
    try {
      await api.post(`/data-checklist/item/${itemId}/request-revision`, { notes });
      setRevisionByItem((p) => ({ ...p, [itemId]: '' }));
      setFeedback('Revision request sent.');
      setExpandedId(null);
      setExpandedPanel(null);
      onReload();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      setFeedback(ax.response?.data?.error || 'Failed to request revision');
    } finally {
      setBusy(null);
    }
  }

  async function importToLibrary(itemId: string) {
    setBusy(`imp-${itemId}`);
    setFeedback(null);
    try {
      const res = await api.post<{ message: string }>(`/data-checklist/item/${itemId}/import-to-library`);
      setFeedback(res.data.message);
      onReload();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      setFeedback(ax.response?.data?.error || 'Import failed');
    } finally {
      setBusy(null);
    }
  }

  const items = data.items;
  const filesOnRecord = items.filter((i) => i.submission).length;
  const missingCount = items.filter((i) => !i.submission && i.status !== 'Received').length;

  const filteredItems = items.filter((item) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'missing') return !item.submission;
    return Boolean(item.submission);
  });

  return (
    <div className="space-y-3">
      {data.engagementRequest?.scope && (
        <PanelCard title="Initial engagement request">
          <p className="text-xs text-muted-foreground px-4 pb-1">
            Submitted {new Date(data.engagementRequest.submittedAt).toLocaleString('en-IN')} ·{' '}
            {data.engagementRequest.clientName}
          </p>
          <p className="text-sm text-foreground px-4 pb-4 whitespace-pre-wrap leading-relaxed line-clamp-4">
            {data.engagementRequest.scope}
          </p>
        </PanelCard>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{filesOnRecord}</span>/{items.length} received
          </span>
          {missingCount > 0 && (
            <span className="text-destructive font-medium">{missingCount} missing</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Filter requests">
            {(['all', 'missing', 'received'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                  statusFilter === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {key}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={onReload}>
            <ArrowsClockwise size={14} /> Refresh
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground" role="status">
          {feedback}
        </div>
      )}

      {filteredItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          {items.length === 0
            ? 'No checklist items yet. Add a request above.'
            : 'No requests match this filter.'}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="table-header">
                <TableHead className="px-3">Request</TableHead>
                <TableHead className="px-3 w-24">Status</TableHead>
                <TableHead className="px-3 w-28 hidden sm:table-cell">Requested</TableHead>
                <TableHead className="px-3 hidden md:table-cell">File</TableHead>
                {canManage && <TableHead className="px-3 w-28 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => {
                const isExpanded = expandedId === item.id;
                return (
                  <RequestRows
                    key={item.id}
                    item={item}
                    canManage={canManage}
                    filesListedAbove={filesListedAbove}
                    isExpanded={isExpanded}
                    expandedPanel={isExpanded ? expandedPanel : null}
                    busy={busy}
                    previewDocId={previewDocId}
                    message={messageByItem[item.id] ?? ''}
                    revision={revisionByItem[item.id] ?? ''}
                    onTogglePanel={(panel) => togglePanel(item.id, panel)}
                    onClose={() => {
                      setExpandedId(null);
                      setExpandedPanel(null);
                    }}
                    onMessageChange={(v) => setMessageByItem((p) => ({ ...p, [item.id]: v }))}
                    onRevisionChange={(v) => setRevisionByItem((p) => ({ ...p, [item.id]: v }))}
                    onSendMessage={() => void sendMessage(item.id)}
                    onRequestRevision={() => void requestRevision(item.id)}
                    onImport={() => void importToLibrary(item.id)}
                    onPreviewToggle={(docId) =>
                      setPreviewDocId(previewDocId === docId ? null : docId)
                    }
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!hideClientUploadsList && data.clientUploads.length > 0 && (
        <PanelCard title="All client uploads">
          <ul className="divide-y divide-border text-sm px-4 pb-2">
            {data.clientUploads.map((d) => (
              <li key={d.id} className="py-2.5 flex justify-between gap-2 items-center">
                <span className="truncate text-foreground">{d.originalName}</span>
                <Button size="sm" variant="ghost" className="h-8 shrink-0" asChild>
                  <a href={d.downloadUrl} target="_blank" rel="noreferrer">
                    Download
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}
    </div>
  );
}

function RequestRows({
  item,
  canManage,
  filesListedAbove,
  isExpanded,
  expandedPanel,
  busy,
  previewDocId,
  message,
  revision,
  onTogglePanel,
  onClose,
  onMessageChange,
  onRevisionChange,
  onSendMessage,
  onRequestRevision,
  onImport,
  onPreviewToggle,
}: {
  item: ChecklistItemWithSubmission;
  canManage: boolean;
  filesListedAbove?: boolean;
  isExpanded: boolean;
  expandedPanel: ExpandedPanel;
  busy: string | null;
  previewDocId: string | null;
  message: string;
  revision: string;
  onTogglePanel: (panel: ExpandedPanel) => void;
  onClose: () => void;
  onMessageChange: (v: string) => void;
  onRevisionChange: (v: string) => void;
  onSendMessage: () => void;
  onRequestRevision: () => void;
  onImport: () => void;
  onPreviewToggle: (docId: string) => void;
}) {
  const colSpan = canManage ? 5 : 4;
  const hasFile = Boolean(item.submission);

  return (
    <>
      <TableRow className={cn(isExpanded && 'bg-muted/30')}>
        <TableCell className="px-3 py-2.5">
          <div className="min-w-0">
            <p className="font-medium text-sm text-foreground leading-snug">{item.title}</p>
            {item.revisionNotes && !isExpanded && (
              <p className="text-xs text-warning mt-0.5 truncate">Revision: {item.revisionNotes}</p>
            )}
          </div>
        </TableCell>
        <TableCell className="px-3 py-2.5">
          <StatusPill status={shortStatus(item)} warn={item.status === 'Received' && !item.submission} />
        </TableCell>
        <TableCell className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
          {new Date(item.requestedAt).toLocaleDateString('en-IN')}
        </TableCell>
        <TableCell className="px-3 py-2.5 hidden md:table-cell">
          {hasFile ? (
            <span className="text-xs text-foreground truncate block max-w-[12rem]" title={item.submission!.originalName}>
              {item.submission!.originalName}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        {canManage && (
          <TableCell className="px-3 py-2.5">
            <div className="flex items-center justify-end gap-0.5">
              <Button
                type="button"
                size="sm"
                variant={expandedPanel === 'message' ? 'secondary' : 'ghost'}
                className="h-8 w-8 p-0"
                aria-label="Message client"
                aria-expanded={expandedPanel === 'message'}
                onClick={() => onTogglePanel('message')}
              >
                <ChatCircle size={16} />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={expandedPanel === 'revision' ? 'secondary' : 'ghost'}
                className="h-8 w-8 p-0"
                aria-label="Request revision"
                aria-expanded={expandedPanel === 'revision'}
                onClick={() => onTogglePanel('revision')}
              >
                <ArrowsClockwise size={16} />
              </Button>
              {(hasFile && !filesListedAbove) || item.revisionNotes ? (
                <Button
                  type="button"
                  size="sm"
                  variant={expandedPanel === 'file' ? 'secondary' : 'ghost'}
                  className="h-8 w-8 p-0"
                  aria-label="Show details"
                  aria-expanded={expandedPanel === 'file'}
                  onClick={() => onTogglePanel('file')}
                >
                  <CaretDown size={16} className={cn(expandedPanel === 'file' && 'rotate-180')} />
                </Button>
              ) : null}
            </div>
          </TableCell>
        )}
      </TableRow>

      {isExpanded && expandedPanel && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={colSpan} className="px-3 py-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-medium text-muted-foreground">
                {expandedPanel === 'message' && 'Message client'}
                {expandedPanel === 'revision' && 'Request corrected file'}
                {expandedPanel === 'file' && 'File details'}
              </p>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Close" onClick={onClose}>
                <X size={14} />
              </Button>
            </div>

            {expandedPanel === 'message' && (
              <div className="flex flex-col sm:flex-row gap-2">
                <Textarea
                  id={`client-msg-${item.id}`}
                  className="min-h-[2.5rem] max-h-24 resize-y bg-background text-sm flex-1"
                  rows={1}
                  placeholder="Comments or questions for the client…"
                  value={message}
                  onChange={(e) => onMessageChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSendMessage();
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 gap-1 shrink-0 sm:self-end"
                  disabled={busy === `msg-${item.id}` || !message.trim()}
                  onClick={onSendMessage}
                >
                  <PaperPlaneTilt size={14} />
                  {busy === `msg-${item.id}` ? 'Sending…' : 'Send'}
                </Button>
              </div>
            )}

            {expandedPanel === 'revision' && (
              <div className="flex flex-col sm:flex-row gap-2">
                <Textarea
                  id={`client-revision-${item.id}`}
                  className="min-h-[2.5rem] max-h-24 resize-y bg-background text-sm flex-1"
                  rows={1}
                  placeholder="What needs to be fixed…"
                  value={revision}
                  onChange={(e) => onRevisionChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onRequestRevision();
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1 shrink-0 border-warning/40 text-warning hover:bg-warning/10 sm:self-end"
                  disabled={busy === `rev-${item.id}` || !revision.trim()}
                  onClick={onRequestRevision}
                >
                  {busy === `rev-${item.id}` ? 'Sending…' : 'Request revision'}
                </Button>
              </div>
            )}

            {expandedPanel === 'file' && (
              <div className="space-y-2">
                {item.revisionNotes && (
                  <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
                    <span className="font-medium text-warning">Revision requested: </span>
                    {item.revisionNotes}
                  </div>
                )}
                {!item.submission && (
                  <p className="text-sm text-muted-foreground">No file linked yet.</p>
                )}
                {item.submission && filesListedAbove && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <FileText size={16} className="text-muted-foreground" />
                    <span>{item.submission.originalName}</span>
                    <span className="text-xs text-muted-foreground">— in table above</span>
                    {canManage && item.submission.folder === 'Client Upload' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1"
                        disabled={busy === `imp-${item.id}`}
                        onClick={onImport}
                      >
                        <ArrowSquareIn size={14} />
                        {busy === `imp-${item.id}` ? 'Importing…' : 'Import'}
                      </Button>
                    )}
                  </div>
                )}
                {item.submission && !filesListedAbove && (
                  <div className="rounded-lg border border-border p-3 space-y-2 bg-background">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex items-start gap-2">
                        <FileText size={18} className="text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium truncate">{item.submission.originalName}</p>
                          <p className="text-xs text-muted-foreground">
                            {(item.submission.size / 1024).toFixed(1)} KB · {item.submission.uploadedByName}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {item.submission.mimeType.includes('pdf') && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1"
                            onClick={() => onPreviewToggle(item.submission!.id)}
                          >
                            <Eye size={14} /> Preview
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-8 gap-1" asChild>
                          <a href={item.submission.downloadUrl} target="_blank" rel="noreferrer">
                            <DownloadSimple size={14} /> Download
                          </a>
                        </Button>
                      </div>
                    </div>
                    {previewDocId === item.submission.id && item.submission.mimeType.includes('pdf') && (
                      <div className="border border-border rounded-lg overflow-hidden h-[min(280px,40vh)]">
                        <DocumentPdfPreview url={item.submission.previewUrl} searchQuery="" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function StatusPill({ status, warn }: { status: string; warn?: boolean }) {
  const tone = warn
    ? 'bg-warning/15 text-warning'
    : status === 'Received'
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
      : status === 'Revision'
        ? 'bg-warning/15 text-warning'
        : status === 'Missing'
          ? 'bg-destructive/15 text-destructive'
          : 'bg-muted text-muted-foreground';

  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-md font-medium whitespace-nowrap', tone)}>
      {status}
    </span>
  );
}
