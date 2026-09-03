import { useCallback, useEffect, useState } from 'react';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import api from '@/services/api';
import { appAlert, appConfirm } from '@/context/AppDialogContext';
import { appToast } from '@/context/AppToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DotmSquare3 } from '@/components/ui/dotm-square-3';
import { RangeSlider } from '@/components/motion/range-slider';
import { ClaimReceiptLightbox } from '@/components/claims/ClaimReceiptLightbox';
import { ClaimFirmHeader } from '@/components/claims/ClaimFirmHeader';
import { ClaimValidationPanel } from '@/components/claims/ClaimValidationPanel';
import {
  CLAIM_TYPE_LABELS,
  MANAGER_APPROVAL_STATUS_LABELS,
  claimSliderStep,
  formatInr,
  managerApprovalBadgeVariant,
  ocrMarkerPercent,
  percentOfClaimed,
  perPersonShare,
  receiptDownloadUrl,
  staffName,
  type StaffClaimRow,
} from '@/lib/expenseClaims';
import { formatApiError } from '@/lib/apiErrors';
import { useAuth } from '@/context/AuthContext';
import { ErrorBanner } from '@/components/layout/ErrorBanner';
import { EmptyState } from '@/components/layout/EmptyState';
import PageLoading from '@/components/layout/PageLoading';

function ManagerApprovalsStrip({ claim }: { claim: StaffClaimRow }) {
  const rows = claim.managerApprovals ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      {rows.map((a) => (
        <Badge key={a.id} variant={managerApprovalBadgeVariant(a.status)} className="font-normal">
          {staffName(a.manager)} · {MANAGER_APPROVAL_STATUS_LABELS[a.status] ?? a.status}
          {a.status === 'partially_approved' && a.approvedAmount != null
            ? ` (${formatInr(a.approvedAmount)})`
            : ''}
        </Badge>
      ))}
    </div>
  );
}

function ClaimActionBar({
  isBusy,
  hasReceipt,
  onAccept,
  onLimit,
  onReject,
}: {
  isBusy: boolean;
  hasReceipt: boolean;
  onAccept: () => void;
  onLimit: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex w-full gap-2">
      <Button
        size="sm"
        variant="success"
        className="h-10 flex-1 min-w-0"
        onClick={onAccept}
        disabled={!hasReceipt || isBusy}
      >
        {isBusy ? <DotmSquare3 size={14} dotSize={2} className="mr-1.5" aria-label="Processing" /> : null}
        Accept
      </Button>
      <Button size="sm" variant="secondary" className="h-10 flex-1 min-w-0" disabled={!hasReceipt || isBusy} onClick={onLimit}>
        Limit
      </Button>
      <Button size="sm" variant="destructive" className="h-10 flex-1 min-w-0" disabled={isBusy} onClick={onReject}>
        Reject
      </Button>
    </div>
  );
}

export function ClaimsApprovalInbox() {
  const { user } = useAuth();
  const isPartnerOrAdmin = user?.role === 'Partner' || user?.role === 'Admin';
  const [claims, setClaims] = useState<StaffClaimRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [partialId, setPartialId] = useState<string | null>(null);
  const [partialAmount, setPartialAmount] = useState('');
  const [partialReason, setPartialReason] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [receiptIndex, setReceiptIndex] = useState<Record<string, number>>({});
  const [lightbox, setLightbox] = useState<{
    slides: { id: string; url: string; name: string; mimeType?: string | null }[];
    index: number;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    void api
      .get<{ claims: StaffClaimRow[] }>('/expense-claims/pending')
      .then((r) => setClaims(r.data.claims))
      .catch((e) => setLoadError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const needsOcrPoll = claims.some((c) => (c.ocrStatus ?? 'pending') === 'pending');
    if (!needsOcrPoll) return;
    const timer = window.setInterval(() => load(), 5000);
    return () => window.clearInterval(timer);
  }, [claims, load]);

  useEffect(() => {
    void (async () => {
      const next: Record<string, string> = {};
      for (const c of claims) {
        const idx = receiptIndex[c.id] ?? 0;
        const r = c.receipts[idx];
        if (!r || previewUrls[r.id] || !r.mimeType?.startsWith('image/')) continue;
        try {
          const res = await api.get(receiptDownloadUrl(r.id), { responseType: 'blob' });
          next[r.id] = URL.createObjectURL(res.data);
        } catch {
          /* skip */
        }
      }
      if (Object.keys(next).length) setPreviewUrls((p) => ({ ...p, ...next }));
    })();
  }, [claims, receiptIndex]);

  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((u) => URL.revokeObjectURL(u));
    };
    // ponytail: revoke only on unmount (ceiling: leaks across claim refreshes until leave page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openLightbox(c: StaffClaimRow) {
    const slides: { id: string; url: string; name: string; mimeType?: string | null }[] = [];
    for (const r of c.receipts) {
      try {
        const res = await api.get(receiptDownloadUrl(r.id), { responseType: 'blob' });
        slides.push({
          id: r.id,
          url: URL.createObjectURL(res.data),
          name: r.fileName,
          mimeType: r.mimeType,
        });
      } catch {
        /* skip */
      }
    }
    if (slides.length) setLightbox({ slides, index: receiptIndex[c.id] ?? 0 });
  }

  async function approve(c: StaffClaimRow) {
    if (!c.receipts.length) {
      void appAlert({ title: 'Receipt required', message: 'Upload a receipt before this claim can be approved.' });
      return;
    }
    const ok = await appConfirm({
      title: 'Approve claim',
      message: `Accept ${formatInr(c.amount)} from ${staffName(c.staff)} (${CLAIM_TYPE_LABELS[c.claimType]})?`,
      confirmLabel: 'Accept',
    });
    if (!ok) return;

    setBusyId(c.id);
    try {
      await api.patch(`/expense-claims/${c.id}/approve`, {});
      appToast({ message: 'Claim accepted', variant: 'success' });
      load();
    } catch (e) {
      void appAlert({ title: 'Approve failed', message: formatApiError(e) });
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) return;
    const claim = claims.find((c) => c.id === id);
    const ok = await appConfirm({
      title: 'Reject claim',
      message: `Reject ${claim ? formatInr(claim.amount) : 'this claim'} from ${claim ? staffName(claim.staff) : 'submitter'}?`,
      confirmLabel: 'Reject',
      destructive: true,
    });
    if (!ok) return;

    setBusyId(id);
    try {
      await api.patch(`/expense-claims/${id}/reject`, { reason: rejectReason.trim() });
      appToast({ message: 'Claim rejected', variant: 'success' });
      setRejectId(null);
      setRejectReason('');
      load();
    } catch (e) {
      void appAlert({ title: 'Reject failed', message: formatApiError(e) });
    } finally {
      setBusyId(null);
    }
  }

  async function partialApprove(id: string, maxAmount: number) {
    if (!partialReason.trim() || !partialAmount) return;
    const amount = parseFloat(partialAmount);
    if (Number.isNaN(amount) || amount <= 0 || amount > maxAmount) {
      void appAlert({ title: 'Invalid amount', message: `Enter an amount up to ${formatInr(maxAmount)}.` });
      return;
    }
    const claim = claims.find((c) => c.id === id);
    const ok = await appConfirm({
      title: 'Approve limited amount',
      message: `Accept ${formatInr(amount)} of ${claim ? formatInr(claim.amount) : 'claimed amount'} from ${claim ? staffName(claim.staff) : 'submitter'}?`,
      confirmLabel: 'Accept limit',
    });
    if (!ok) return;

    setBusyId(id);
    try {
      await api.patch(`/expense-claims/${id}/partial-approve`, {
        approvedAmount: amount,
        reason: partialReason.trim(),
      });
      appToast({ message: 'Claim accepted with limit', variant: 'success' });
      setPartialId(null);
      setPartialAmount('');
      setPartialReason('');
      load();
    } catch (e) {
      void appAlert({ title: 'Limit approve failed', message: formatApiError(e) });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <PageLoading className="py-8" label="Loading claims…" />;
  if (loadError) return <ErrorBanner message={loadError} onRetry={() => { setLoading(true); load(); }} />;
  if (claims.length === 0) return <EmptyState title="No pending claims" className="py-6" />;

  return (
    <div className="space-y-3">
      {claims.map((c) => {
        const count = c.participantCount ?? c.participants?.length ?? 1;
        const share = perPersonShare(c.amount, count);
        const isGroup = count > 1;
        const rIdx = receiptIndex[c.id] ?? 0;
        const receipt = c.receipts[rIdx];
        const myApproval = c.managerApprovals?.find((a) => a.status === 'pending');
        const maxPartial = isPartnerOrAdmin
          ? Number(c.amount)
          : Number(myApproval?.teamAmount ?? c.amount);
        const isBusy = busyId === c.id;
        const partialVal = parseFloat(partialAmount) || 0;
        const ocrPct = ocrMarkerPercent(c.ocrDetectedAmount, maxPartial);
        const claimedPct = percentOfClaimed(partialVal, c.amount);
        const showReject = rejectId === c.id;
        const showLimit = partialId === c.id;

        return (
          <article key={c.id} className="rounded-lg border border-border bg-card shadow-card">
            <div className="p-3 sm:p-4 space-y-3">
              <ClaimFirmHeader claim={c} />

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-4">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">Receipt</p>
                    {c.receipts.length > 1 && (
                      <div className="flex items-center gap-1 text-[11px] tabular-nums">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => setReceiptIndex((ri) => ({ ...ri, [c.id]: Math.max(0, rIdx - 1) }))}
                          disabled={rIdx === 0}
                        >
                          &lt;
                        </Button>
                        {rIdx + 1}/{c.receipts.length}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() =>
                            setReceiptIndex((ri) => ({ ...ri, [c.id]: Math.min(c.receipts.length - 1, rIdx + 1) }))
                          }
                          disabled={rIdx >= c.receipts.length - 1}
                        >
                          &gt;
                        </Button>
                      </div>
                    )}
                  </div>
                  {!receipt ? (
                    <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-xs text-warning">
                      No receipt
                    </div>
                  ) : previewUrls[receipt.id] ? (
                    <button
                      type="button"
                      className="block w-full rounded-md border border-border overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => void openLightbox(c)}
                    >
                      <img
                        src={previewUrls[receipt.id]}
                        alt={receipt.fileName}
                        className="h-40 w-full object-contain bg-muted/20 sm:h-48"
                      />
                    </button>
                  ) : (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted/20">
                      {receipt.mimeType?.startsWith('image/') ? (
                        <DotmSquare3 size={24} dotSize={3} aria-label="Loading receipt" />
                      ) : (
                        <p className="text-xs text-muted-foreground">{receipt.fileName}</p>
                      )}
                      <Button type="button" size="sm" variant="outline" onClick={() => void openLightbox(c)}>
                        Open
                      </Button>
                    </div>
                  )}
                  {isGroup && (
                    <p className="text-[11px] text-muted-foreground">
                      {count} people · {formatInr(share)}/person
                    </p>
                  )}
                </div>

                <div className="min-w-0 space-y-2">
                  <ClaimValidationPanel claim={c} />
                  <ManagerApprovalsStrip claim={c} />
                </div>
              </div>

              {(c.participants?.length ?? 0) > 0 && (
                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[11px] font-medium text-foreground"
                    onClick={() => setExpanded((e) => ({ ...e, [c.id]: !e[c.id] }))}
                  >
                    {expanded[c.id] ? <CaretDown size={12} /> : <CaretRight size={12} />}
                    Participants ({c.participants!.length})
                  </button>
                  {expanded[c.id] && (
                    <ul className="mt-1 space-y-0.5 border-l border-border pl-2 text-[11px]">
                      {c.participants!.map((p) => (
                        <li key={p.id} className="flex gap-2">
                          <span className="w-24 truncate">{staffName(p.user)}</span>
                          <span className="truncate text-muted-foreground">{p.engagement?.title ?? '—'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {showReject && (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <Label htmlFor={`reject-${c.id}`}>Reject reason</Label>
                  <Input id={`reject-${c.id}`} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!rejectReason.trim() || isBusy}
                      onClick={() => void reject(c.id)}
                    >
                      Confirm reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejectId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {showLimit && (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <Label>Approved amount</Label>
                    <span className="font-semibold tabular-nums">{formatInr(partialVal)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {claimedPct}% of {formatInr(c.amount)}
                    {c.ocrDetectedAmount != null ? ` · OCR ${formatInr(c.ocrDetectedAmount)}` : ''}
                  </p>
                  <div className="relative pt-1">
                    {ocrPct != null && (
                      <div
                        className="pointer-events-none absolute top-0 z-10 h-10 w-0.5 -translate-x-1/2 bg-warning"
                        style={{ left: `${ocrPct}%` }}
                      />
                    )}
                    <RangeSlider
                      min={0}
                      max={maxPartial}
                      step={claimSliderStep(maxPartial)}
                      value={partialVal}
                      onValueChange={(v) => setPartialAmount(String(v))}
                      formatValueText={(v) => formatInr(v)}
                      aria-label="Approved amount"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`partial-reason-${c.id}`}>Reason</Label>
                    <Input
                      id={`partial-reason-${c.id}`}
                      value={partialReason}
                      onChange={(e) => setPartialReason(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      disabled={!partialReason.trim() || !partialAmount || isBusy}
                      onClick={() => void partialApprove(c.id, maxPartial)}
                    >
                      Confirm limit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPartialId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <footer className="border-t border-border bg-muted/20 px-3 py-3 sm:px-4">
              <ClaimActionBar
                isBusy={isBusy}
                hasReceipt={c.receipts.length > 0}
                onAccept={() => void approve(c)}
                onLimit={() => {
                  setPartialId(c.id);
                  setPartialAmount(String(maxPartial));
                  setPartialReason('');
                  setRejectId(null);
                }}
                onReject={() => {
                  setRejectId(c.id);
                  setRejectReason('');
                  setPartialId(null);
                }}
              />
            </footer>
          </article>
        );
      })}
      {lightbox && (
        <ClaimReceiptLightbox
          slides={lightbox.slides}
          index={lightbox.index}
          onClose={() => {
            lightbox.slides.forEach((s) => URL.revokeObjectURL(s.url));
            setLightbox(null);
          }}
          onIndexChange={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : null))}
        />
      )}
    </div>
  );
}
