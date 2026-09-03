import { useMemo, useState } from 'react';
import { DownloadSimple, Eye, FileText, ShieldCheck, UploadSimple } from '@phosphor-icons/react';
import api from '@/services/api';
import ClientSubmissionsPanel, {
  type ChecklistPayload,
  type SubmissionDocument,
} from './ClientSubmissionsPanel';
import { PanelCard } from '@/components/layout/PanelCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ApprovalStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface KycDoc {
  id: string;
  docType: string;
  status: string;
  receivedAt?: string | null;
  verifiedBy?: { firstName: string; lastName: string } | null;
}

interface Props {
  submissions: ChecklistPayload | null;
  kyc: KycDoc[];
  engagementId: string;
  engagementDocuments: Array<{
    id: string;
    originalName: string;
    folder: string;
    category: string | null;
    createdAt: string;
    previewUrl: string;
    downloadUrl: string;
  }>;
  canManage: boolean;
  isPartner: boolean;
  loading?: boolean;
  pendingRequestCount?: number;
  newChecklist: string;
  onNewChecklistChange: (v: string) => void;
  onAddChecklist: () => void;
  onSetKycStatus: (id: string, status: string) => void;
  onReload: () => void;
}

function ClientUploadRow({
  doc,
  linkedRequest,
}: {
  doc: SubmissionDocument;
  linkedRequest?: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="font-medium truncate">{doc.originalName}</div>
            <div className="text-xs text-muted-foreground truncate">
              {linkedRequest ? `Checklist: ${linkedRequest}` : doc.category || 'Client upload'}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          Received
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(doc.createdAt).toLocaleDateString('en-IN')}
      </TableCell>
      <TableCell className="text-muted-foreground">{doc.uploadedByName || 'Client'}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="outline" className="h-8 gap-1" asChild>
            <a href={doc.previewUrl} target="_blank" rel="noreferrer">
              <Eye size={14} />
              Preview
            </a>
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1" asChild>
            <a href={doc.downloadUrl}>
              <DownloadSimple size={14} />
              Download
            </a>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function EngagementDocumentsPanel({
  submissions,
  kyc,
  engagementId,
  engagementDocuments,
  canManage,
  isPartner,
  loading,
  pendingRequestCount = 0,
  newChecklist,
  onNewChecklistChange,
  onAddChecklist,
  onSetKycStatus,
  onReload,
}: Props) {
  const [uploading, setUploading] = useState(false);

  async function uploadFirmFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('engagementId', engagementId);
      formData.append('category', 'Workpaper');
      formData.append('folder', 'Current File');
      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onReload();
    } finally {
      setUploading(false);
    }
  }

  const checklistTitleByDocId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of submissions?.items ?? []) {
      if (item.submission?.id) map.set(item.submission.id, item.title);
    }
    return map;
  }, [submissions]);

  const clientUploadIds = useMemo(() => {
    const ids = new Set<string>();
    for (const u of submissions?.clientUploads ?? []) ids.add(u.id);
    return ids;
  }, [submissions]);

  const allClientUploads = submissions?.clientUploads ?? [];
  const clientFileCount = kyc.length + allClientUploads.length;
  const openRequests = pendingRequestCount;

  const otherFiles = useMemo(
    () => engagementDocuments.filter((d) => !clientUploadIds.has(d.id)),
    [engagementDocuments, clientUploadIds]
  );

  if (loading && !submissions) {
    return (
      <div className="flex justify-center py-16">
        <div className="size-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PanelCard title="Documents from client" className="!p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck size={18} className="text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">All files sent by the client</p>
              <p className="text-xs text-muted-foreground">
                KYC, portal uploads, and checklist submissions for this engagement
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-normal">
              {clientFileCount} file{clientFileCount === 1 ? '' : 's'}
            </Badge>
            {kyc.length > 0 && (
              <Badge variant="outline" className="font-normal">
                {kyc.length} KYC
              </Badge>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="table-header">
                <TableHead className="px-4">Document</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Received</TableHead>
                <TableHead className="px-4">Uploaded by</TableHead>
                <TableHead className="px-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kyc.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">
                    <div>
                      {k.docType}
                      <div className="text-xs font-normal text-muted-foreground">Firm-wide KYC</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ApprovalStatusBadge status={k.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {k.receivedAt ? new Date(k.receivedAt).toLocaleDateString('en-IN') : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {k.verifiedBy ? `${k.verifiedBy.firstName} ${k.verifiedBy.lastName}` : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {k.status !== 'Received' && k.status !== 'Verified' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void onSetKycStatus(k.id, 'Received')}
                        >
                          Mark received
                        </Button>
                      )}
                      {k.status !== 'Verified' && isPartner && (
                        <Button size="sm" onClick={() => void onSetKycStatus(k.id, 'Verified')}>
                          Verify
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {allClientUploads.map((doc) => (
                <ClientUploadRow
                  key={doc.id}
                  doc={doc}
                  linkedRequest={checklistTitleByDocId.get(doc.id)}
                />
              ))}
              {clientFileCount === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No client documents yet. Add a request below or ask the client to upload in
                    their portal.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </PanelCard>

      <PanelCard
        title="Document requests"
        action={
          openRequests > 0 ? (
            <Badge variant="destructive" className="bg-warning/15 text-warning border-warning/30">
              {openRequests} pending
            </Badge>
          ) : undefined
        }
      >
        <p className="text-xs text-muted-foreground mb-3">
          Add requests below. Use row actions to message the client or ask for a revision — forms stay collapsed until you need them.
        </p>
        <div className="flex gap-2 mb-4">
          <input
            className="input-field flex-1"
            aria-label="Document request for client"
            placeholder="Add a document the client needs to provide…"
            value={newChecklist}
            onChange={(e) => onNewChecklistChange(e.target.value)}
            disabled={!canManage}
          />
          <Button onClick={() => void onAddChecklist()} disabled={!canManage || !newChecklist.trim()}>
            Add request
          </Button>
        </div>
        <ClientSubmissionsPanel
          data={submissions}
          onReload={onReload}
          canManage={canManage}
          hideClientUploadsList
          filesListedAbove
        />
      </PanelCard>

      {otherFiles.length > 0 && (
        <PanelCard
          title="Firm workpapers & uploads"
          action={
            <Badge variant="secondary" className="font-normal">
              {otherFiles.length}
            </Badge>
          }
        >
          <p className="text-xs text-muted-foreground mb-3">
            Internal files and staff uploads for this engagement.
          </p>
          {canManage && (
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-primary">
              <UploadSimple size={16} />
              {uploading ? 'Uploading…' : 'Upload firm document'}
              <input
                type="file"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFirmFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          <ul className="divide-y divide-border text-sm">
            {otherFiles.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={16} className="shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{f.originalName}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.folder}
                      {f.category ? ` · ${f.category}` : ''} ·{' '}
                      {new Date(f.createdAt).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" className="h-8" asChild>
                    <a href={f.previewUrl} target="_blank" rel="noreferrer">
                      Preview
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" asChild>
                    <a href={f.downloadUrl}>Download</a>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}
    </div>
  );
}
