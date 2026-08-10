import { useEffect, useState } from 'react';
import { Clock, FileText } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { useAppToast } from '@/context/AppToastContext';
import { Button } from '@/components/ui/button';
import { LetterWorkflowStepper } from '@/components/mkd/LetterWorkflowStepper';
import { LetterSignedCelebration } from '@/components/mkd/LetterSignedCelebration';
import { EngagementLetterSkeleton } from '@/components/mkd/MkdSkeletons';
import { EngagementLetterPreview } from '@/components/mkd/EngagementLetterPreview';
import { PanelCard } from '@/components/layout/PanelCard';
import { LetterStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import { useEngagementLetter } from '@/hooks/useEngagementLetter';

const SIBLING_HINT_KEY = 'mkd-letter-sibling-hint-seen';

export function EngagementLetterPanel({
  engagementId,
  showSiblingNote = true,
}: {
  engagementId: string;
  showSiblingNote?: boolean;
}) {
  const { user } = useAuth();
  const { showToast } = useAppToast();
  const canManage = user?.role === 'Partner' || user?.role === 'Admin';

  const {
    eng,
    letter,
    siblingCount,
    loading,
    error,
    busyAction,
    docxUrl,
    load,
    generateLetter,
    saveLetterDraft,
    sendLetter,
  } = useEngagementLetter(engagementId);

  const [feeParticular, setFeeParticular] = useState('Professional fees');
  const [feeAmount, setFeeAmount] = useState('Rs. ___/- plus applicable GST');
  const [letterDraft, setLetterDraft] = useState<{ body: string | null; subject: string | null }>({
    body: null,
    subject: null,
  });
  const letterBody = letterDraft.body ?? letter?.generatedContent ?? '';
  const subjectLine = letterDraft.subject ?? letter?.subjectLine ?? '';
  const [showSiblingHint, setShowSiblingHint] = useState(() => {
    if (!showSiblingNote) return false;
    try {
      return !sessionStorage.getItem(SIBLING_HINT_KEY);
    } catch {
      return true;
    }
  });

  useEffect(() => {
    setLetterDraft({ body: null, subject: null });
  }, [letter?.id]);

  async function handleGenerate() {
    const result = await generateLetter(feeParticular, feeAmount);
    if (result.ok) {
      if (result.preview) setLetterDraft((d) => ({ ...d, body: result.preview ?? null }));
      showToast({
        title: 'Letter generated',
        message: 'Edit the letter body below, preview the Word document, then send to the client portal.',
        variant: 'success',
      });
    } else {
      showToast({ title: 'Generate failed', message: result.error, variant: 'error' });
    }
  }

  async function handleSave() {
    const result = await saveLetterDraft({
      generatedContent: letterBody,
      subjectLine: subjectLine || undefined,
      fees: [{ particular: feeParticular, amount: feeAmount }],
    });
    if (result.ok) {
      showToast({
        title: 'Draft saved',
        message: 'Word document preview updated. Send when ready.',
        variant: 'success',
      });
      void load({ silent: true });
    } else {
      showToast({ title: 'Save failed', message: result.error, variant: 'error' });
    }
  }

  async function handleSend() {
    if (letterBody.trim() && letter?.status === 'draft') {
      const saveResult = await saveLetterDraft({
        generatedContent: letterBody,
        subjectLine: subjectLine || undefined,
        fees: [{ particular: feeParticular, amount: feeAmount }],
      });
      if (!saveResult.ok) {
        showToast({ title: 'Could not save letter', message: saveResult.error, variant: 'error' });
        return;
      }
    }
    const result = await sendLetter();
    if (result.ok) {
      showToast({
        title: 'Letter sent to client',
        message: 'The client can review the Word document and sign from their dashboard.',
        variant: 'success',
      });
    } else {
      showToast({ title: 'Send failed', message: result.error, variant: 'error' });
    }
  }

  if (loading) {
    return <EngagementLetterSkeleton />;
  }

  if (error || !eng) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error || 'Engagement not found'}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const letterStatus = eng.letterStatus ?? 'not_required';
  const requestStatus = eng.requestStatus ?? 'approved';
  const canEditLetter = letterStatus === 'draft' && (!letter || letter.status === 'draft');
  const awaitingClient = letterStatus === 'sent' || letter?.status === 'sent';

  if (letterStatus === 'signed' && letter?.status === 'signed') {
    return <LetterSignedCelebration engagementId={engagementId} siblingCount={siblingCount} />;
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {showSiblingHint && siblingCount > 1 && (
        <div className="text-sm rounded-lg border border-border bg-muted/30 p-3 flex justify-between gap-3">
          <span>
            This request created <strong>{siblingCount}</strong> engagements. The engagement letter on this
            engagement applies to all linked pipelines once the client signs.
          </span>
          <button
            type="button"
            className="text-xs text-primary shrink-0 hover:underline"
            onClick={() => {
              setShowSiblingHint(false);
              try {
                sessionStorage.setItem(SIBLING_HINT_KEY, '1');
              } catch {
                /* ignore */
              }
            }}
          >
            Got it
          </button>
        </div>
      )}

      {awaitingClient && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm flex items-start gap-2">
          <Clock size={18} className="text-warning shrink-0 mt-0.5" />
          <p>
            Letter sent to the <strong>client dashboard</strong>. Only the client can sign by entering their authorised signatory name.
          </p>
        </div>
      )}

      <LetterWorkflowStepper
        requestStatus={requestStatus}
        letterStatus={letterStatus}
        hasEngagement
        hasLetter={!!letter}
        canAct={canManage}
        busyAction={busyAction === 'save' ? null : busyAction}
        onGenerate={() => void handleGenerate()}
        onSend={() => void handleSend()}
      />

      <PanelCard title={eng.title}>
        <div className="space-y-4">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Letter</span>
          <LetterStatusBadge status={letterStatus} />
          {letter && (
            <>
              <span>Document</span>
              <LetterStatusBadge status={letter.status} />
            </>
          )}
        </p>

        {canManage && canEditLetter && (
          <>
            <label className="block text-sm">
              <span className="text-muted-foreground">Subject line</span>
              <input
                className="input-field mt-1 w-full"
                value={subjectLine}
                onChange={(e) => setLetterDraft((d) => ({ ...d, subject: e.target.value }))}
                placeholder="Sub: Engagement Letter for …"
                disabled={!!busyAction}
              />
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-muted-foreground">Fee particular</span>
                <input
                  className="input-field mt-1 w-full"
                  value={feeParticular}
                  onChange={(e) => setFeeParticular(e.target.value)}
                  disabled={!!busyAction}
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Fee amount</span>
                <input
                  className="input-field mt-1 w-full"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  disabled={!!busyAction}
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="text-muted-foreground">Letter body (editable — MKD format)</span>
              <textarea
                className="input-field mt-1 w-full font-mono text-xs min-h-[320px] leading-relaxed"
                value={letterBody}
                onChange={(e) => setLetterDraft((d) => ({ ...d, body: e.target.value }))}
                disabled={!!busyAction}
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Generate from template first, then edit scope, fees, and terms before sending the PDF.
              </p>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!!busyAction}
                onClick={() => void handleGenerate()}
              >
                {busyAction === 'generate' ? 'Generating…' : letter ? 'Regenerate from template' : 'Generate letter'}
              </Button>
              {letter && (
                <Button type="button" variant="outline" disabled={!!busyAction} onClick={() => void handleSave()}>
                  {busyAction === 'save' ? 'Saving…' : 'Save draft & refresh Word doc'}
                </Button>
              )}
              {letter?.status === 'draft' && (
                <Button type="button" disabled={!!busyAction} onClick={() => void handleSend()}>
                  {busyAction === 'send' ? 'Sending…' : 'Send letter to client'}
                </Button>
              )}
            </div>
            {!letter && (
              <p className="text-xs text-muted-foreground">Generate the letter before editing or sending.</p>
            )}
          </>
        )}

        {canManage && !canEditLetter && !awaitingClient && letterStatus !== 'signed' && (
          <p className="text-sm text-muted-foreground">
            Only <strong>Partner</strong> or <strong>Admin</strong> can generate and send letters. Edit fees only
            while the letter is in draft.
          </p>
        )}

        {!canManage && (
          <p className="text-sm text-muted-foreground">Only Partners and Admins can manage the engagement letter.</p>
        )}

        {(letterBody.trim() || docxUrl) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <FileText size={14} />
              Letter preview
            </p>
            <EngagementLetterPreview
              content={letterBody}
              docxUrl={docxUrl}
              cacheKey={letter?.updatedAt ?? letter?.id ?? 'draft'}
            />
          </div>
        )}

        {!letterBody.trim() && !docxUrl && letter?.generatedContent && canEditLetter && (
          <p className="text-xs text-muted-foreground">Generate or save the letter to see a preview.</p>
        )}
        </div>
      </PanelCard>
    </div>
  );
}
