import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PanelCard } from '@/components/layout/PanelCard';
import PageHeader from '@/components/layout/PageHeader';
import PageLoading from '@/components/layout/PageLoading';
import { ErrorBanner } from '@/components/layout/ErrorBanner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClaimFirmHeader } from '@/components/claims/ClaimFirmHeader';
import { ClaimValidationPanel } from '@/components/claims/ClaimValidationPanel';
import { ClaimReceiptLightbox } from '@/components/claims/ClaimReceiptLightbox';
import {
  CLAIM_STATUS_LABELS,
  CLAIM_TYPE_LABELS,
  PROCESSING_STATUS_LABELS,
  TRAVEL_MODE_LABELS,
  claimStatusBadgeVariant,
  formatInr,
  receiptDownloadUrl,
  staffName,
  type StaffClaimRow,
} from '@/lib/expenseClaims';
import { apiAbsoluteUrl } from '@/lib/apiBase';
import { formatApiError } from '@/lib/apiErrors';

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canSeeValidation = ['Partner', 'Admin', 'Manager', 'Accounts'].includes(user?.role ?? '');
  const [claim, setClaim] = useState<StaffClaimRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    slides: { id: string; url: string; name: string; mimeType?: string | null }[];
    index: number;
  } | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    void api
      .get<StaffClaimRow>(`/expense-claims/${id}`)
      .then((r) => setClaim(r.data))
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!claim?.receipts?.length) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const r of claim.receipts) {
        try {
          const res = await api.get(receiptDownloadUrl(r.id), { responseType: 'blob' });
          if (!cancelled) next[r.id] = URL.createObjectURL(res.data as Blob);
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setPreviewUrls(next);
    })();
    return () => {
      cancelled = true;
      Object.values(previewUrls).forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount/claim change
  }, [claim?.id]);

  if (loading) {
    return (
      <AppPageContainer>
        <PageHeader title="Claim" />
        <PageLoading />
      </AppPageContainer>
    );
  }

  if (error || !claim) {
    return (
      <AppPageContainer>
        <PageHeader title="Claim" />
        <ErrorBanner message={error ?? 'Claim not found'} onRetry={() => navigate(0)} />
        <Button variant="outline" className="mt-3" asChild>
          <Link to="/claims">Back to claims</Link>
        </Button>
      </AppPageContainer>
    );
  }

  function openLightbox(startId: string) {
    const slides = claim!.receipts
      .filter((r) => previewUrls[r.id])
      .map((r) => ({ id: r.id, url: previewUrls[r.id]!, name: r.fileName, mimeType: r.mimeType }));
    const index = Math.max(0, slides.findIndex((s) => s.id === startId));
    if (slides.length) setLightbox({ slides, index });
  }

  return (
    <AppPageContainer>
      <PageHeader
        title={`${CLAIM_TYPE_LABELS[claim.claimType] ?? claim.claimType} claim`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/claims?tab=batches">Batches</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/claims">Claims</Link>
            </Button>
          </div>
        }
      />

      <div className="space-y-4 max-w-3xl">
        <PanelCard>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge variant={claimStatusBadgeVariant(claim.claimStatus)}>
              {CLAIM_STATUS_LABELS[claim.claimStatus] ?? claim.claimStatus}
            </Badge>
            <Badge variant="outline">{PROCESSING_STATUS_LABELS[claim.processingStatus] ?? claim.processingStatus}</Badge>
            {claim.batchId && (
              <Badge variant="secondary">Batch {claim.batchId.replace(/-/g, '').slice(0, 8).toUpperCase()}</Badge>
            )}
          </div>
          <ClaimFirmHeader claim={claim} />
        </PanelCard>

        {canSeeValidation && (
          <PanelCard title="Validation">
            <ClaimValidationPanel claim={claim} />
          </PanelCard>
        )}

        {claim.claimType === 'travel' && (
          <PanelCard title="Travel">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {claim.travelMode && (
                <div>
                  <dt className="text-xs text-muted-foreground">Mode</dt>
                  <dd>{TRAVEL_MODE_LABELS[claim.travelMode] ?? claim.travelMode}</dd>
                </div>
              )}
              {claim.visitedBy && (
                <div>
                  <dt className="text-xs text-muted-foreground">Visited by</dt>
                  <dd>{staffName(claim.visitedBy)}</dd>
                </div>
              )}
              {claim.jurisdiction && (
                <div>
                  <dt className="text-xs text-muted-foreground">Jurisdiction</dt>
                  <dd>{claim.jurisdiction}</dd>
                </div>
              )}
              {claim.centreState && (
                <div>
                  <dt className="text-xs text-muted-foreground">Centre / State</dt>
                  <dd>{claim.centreState}</dd>
                </div>
              )}
              {claim.location && (
                <div>
                  <dt className="text-xs text-muted-foreground">Location</dt>
                  <dd>{claim.location}</dd>
                </div>
              )}
              {claim.period && (
                <div>
                  <dt className="text-xs text-muted-foreground">Period</dt>
                  <dd>{claim.period}</dd>
                </div>
              )}
              {claim.issue && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Issue</dt>
                  <dd className="whitespace-pre-wrap">{claim.issue}</dd>
                </div>
              )}
              {claim.replyFromDepartment && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Reply from Department</dt>
                  <dd className="whitespace-pre-wrap">{claim.replyFromDepartment}</dd>
                </div>
              )}
              {claim.mapLink && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Map</dt>
                  <dd>
                    <a className="underline break-all" href={claim.mapLink} target="_blank" rel="noreferrer">
                      {claim.mapLink}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </PanelCard>
        )}

        <PanelCard title="Amounts">
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Claimed</dt>
              <dd className="font-semibold tabular-nums">{formatInr(claim.amount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Approved</dt>
              <dd className="font-semibold tabular-nums">
                {claim.approvedAmount != null ? formatInr(claim.approvedAmount) : '—'}
              </dd>
            </div>
            {canSeeValidation && (
              <div>
                <dt className="text-xs text-muted-foreground">OCR</dt>
                <dd className="font-semibold tabular-nums">
                  {claim.ocrDetectedAmount != null ? formatInr(claim.ocrDetectedAmount) : '—'}
                </dd>
              </div>
            )}
          </dl>
        </PanelCard>

        <PanelCard title="Receipts">
          {claim.receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No receipts.</p>
          ) : (
            <ul className="space-y-2">
              {claim.receipts.map((r, i) => {
                const url = previewUrls[r.id];
                const isImg = !r.mimeType || r.mimeType.startsWith('image/');
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 text-sm">
                    {isImg && url ? (
                      <button
                        type="button"
                        className="h-14 w-14 overflow-hidden rounded border border-border"
                        onClick={() => openLightbox(r.id)}
                      >
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ) : null}
                    <a
                      className="underline"
                      href={apiAbsoluteUrl(receiptDownloadUrl(r.id))}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.fileName || `Receipt ${i + 1}`}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </PanelCard>

        {(claim.participants?.length ?? 0) > 0 && (
          <PanelCard title="People">
            <ul className="text-sm space-y-1">
              {claim.participants!.map((p) => (
                <li key={p.id} className="flex flex-wrap gap-2">
                  <span>{staffName(p.user)}</span>
                  <span className="text-muted-foreground">{p.engagement?.title ?? '—'}</span>
                  <span className="tabular-nums">{formatInr(p.amountShare)}</span>
                </li>
              ))}
            </ul>
          </PanelCard>
        )}
      </div>

      {lightbox && lightbox.slides.length > 0 && (
        <ClaimReceiptLightbox
          slides={lightbox.slides}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndexChange={(i) => setLightbox((l) => (l ? { ...l, index: i } : null))}
        />
      )}
    </AppPageContainer>
  );
}
