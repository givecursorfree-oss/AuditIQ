import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ClientActivationNotice from '@/components/engagement/ClientActivationNotice';
import { DownloadSimple as Download, FileText, UploadSimple as Upload } from '@phosphor-icons/react';
import { useClientPortal } from './ClientPortalContext';

export function ClientPortalDocumentsTab() {
  const {
    uploadMessage,
    uploadError,
    engagements,
    uploadAllowed,
    selectedUploadEngagement,
    engagementDetail,
    checklistUploading,
    handleChecklistUpload,
    uploadEngagementId,
    setUploadEngagementId,
    setSelectedEngagementId,
    setUploadError,
    uploading,
    handleUpload,
    documentsForEngagement,
    downloadClientDocument,
  } = useClientPortal();

  return (
    <div className="mt-4 space-y-4">
      {uploadMessage && (
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {uploadMessage}
        </div>
      )}
      {uploadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {uploadError}
        </div>
      )}

      {engagements.length > 0 && !uploadAllowed && (
        <ClientActivationNotice engagementName={selectedUploadEngagement?.name} />
      )}

      {engagementDetail && engagementDetail.isActivated && engagementDetail.checklist.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload by checklist item</CardTitle>
            <CardDescription>Upload each requested document for {engagementDetail.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {engagementDetail.checklist.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <span className="text-sm text-foreground">{item.title}</span>
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
                          ? 'Re-upload required'
                          : 'Pending'}
                  </Badge>
                  {item.status !== 'Uploaded' && item.status !== 'Verified' && (
                    <label className="cursor-pointer">
                      <Button size="sm" variant="outline" disabled={checklistUploading === item.id} asChild>
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
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              {uploadAllowed
                ? 'Upload any document for this engagement — even if we didn’t specifically request it. Your audit team sees everything on that engagement’s Documents tab.'
                : 'Uploads unlock after your firm assigns a team to the engagement.'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {engagements.length > 0 && (
              <select
                className="input-field text-sm max-w-xs"
                value={uploadEngagementId}
                onChange={(ev) => {
                  setUploadEngagementId(ev.target.value);
                  setSelectedEngagementId(ev.target.value);
                  setUploadError(null);
                }}
              >
                {engagements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {!e.isActivated ? ' — Awaiting activation' : ''}
                  </option>
                ))}
              </select>
            )}
            <label className={uploadAllowed ? undefined : 'cursor-not-allowed'}>
              <Button
                size="sm"
                disabled={uploading || !uploadEngagementId || !uploadAllowed}
                title={
                  !uploadAllowed
                    ? 'Assign a team to this engagement before uploading documents'
                    : undefined
                }
                asChild
              >
                <span>
                  <Upload size={16} className="mr-2" />
                  {uploading ? 'Uploading…' : uploadAllowed ? 'Upload any document' : 'Upload locked'}
                </span>
              </Button>
              <input
                type="file"
                className="hidden"
                onChange={handleUpload}
                disabled={!uploadAllowed}
              />
            </label>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {documentsForEngagement.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <FileText size={40} />
              <p>{uploadEngagementId ? 'No documents for this engagement yet.' : 'No documents yet.'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="table-header">
                  <TableHead className="px-4">File</TableHead>
                  <TableHead className="px-4">Type</TableHead>
                  <TableHead className="px-4">Uploaded</TableHead>
                  <TableHead className="px-4 w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentsForEngagement.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="px-4 font-medium text-foreground">{d.name}</TableCell>
                    <TableCell className="px-4">{d.type}</TableCell>
                    <TableCell className="px-4 text-sm">
                      {new Date(d.uploadedAt).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell className="px-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="icon-btn"
                        onClick={() => downloadClientDocument(d.id)}
                      >
                        <Download size={16} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
