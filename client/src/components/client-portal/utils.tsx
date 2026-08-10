import type { TimelineItem } from '@/components/ui/timeline';
import type { ServiceRequestRow, TimelineStage } from './types';

export function statusBadgeVariant(status: string): 'default' | 'secondary' | 'success' | 'destructive' | 'outline' {
  const s = status.toLowerCase();
  if (s.includes('complete') || s.includes('closed') || s.includes('filed')) return 'success';
  if (s.includes('progress') || s.includes('fieldwork') || s.includes('planning')) return 'default';
  if (s.includes('cancel') || s.includes('reject')) return 'destructive';
  return 'secondary';
}

export function stageToTimelineItems(stages: TimelineStage[]): TimelineItem[] {
  return stages.map((s) => ({
    id: s.id,
    title: s.stage,
    description: s.description ?? (s.actor ? `Updated by ${s.actor}` : undefined),
    timestamp: s.timestamp ?? undefined,
    status: s.status,
    content:
      s.status === 'active' ? (
        <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-foreground-secondary">
          Your engagement is at this stage. Upload any pending documents from the Documents tab.
        </div>
      ) : undefined,
  }));
}

export function serviceRequestNextStep(row: ServiceRequestRow): string {
  if (row.status === 'rejected') {
    return row.rejectionReason
      ? `Request not approved: ${row.rejectionReason}`
      : 'This request was not approved. Contact your CA firm or submit a new request.';
  }
  if (row.status === 'pending') {
    return 'Your CA firm is reviewing this request. Once approved, an engagement letter will appear on this dashboard for you to review and sign.';
  }
  const letter = row.engagement?.letterStatus;
  if (letter === 'sent') {
    return 'Your engagement letter is ready — review and sign it using the banner at the top of this page.';
  }
  if (letter === 'signed') {
    return 'Engagement letter signed. Your team will be assigned shortly and work will begin.';
  }
  if (letter === 'draft' || letter === 'rejected') {
    return 'Your engagement letter is being prepared by the firm. It will appear here when sent for your signature.';
  }
  return 'Request approved. Watch this dashboard for your engagement letter to review and sign.';
}
