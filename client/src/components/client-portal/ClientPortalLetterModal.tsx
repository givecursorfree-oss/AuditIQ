import { Button } from '@/components/ui/button';
import { EngagementLetterPreview } from '@/components/mkd/EngagementLetterPreview';
import { X } from '@phosphor-icons/react';
import { useClientPortal } from './ClientPortalContext';
import { apiAbsoluteUrl } from '@/lib/apiBase';

export function ClientPortalLetterModal() {
  const {
    reviewLetterId,
    setReviewLetterId,
    reviewLetterLoading,
    reviewLetterContent,
    letterSignatoryName,
    setLetterSignatoryName,
    letterAccepting,
    uploadError,
    acceptEngagementLetter,
  } = useClientPortal();

  if (!reviewLetterId) return null;

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 flex max-h-none max-w-none items-center justify-center border-0 bg-black/50 p-4 backdrop-blur-sm"
      aria-labelledby="engagement-letter-review-title"
      onClick={() => setReviewLetterId(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setReviewLetterId(null);
      }}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <h2 id="engagement-letter-review-title" className="text-lg font-semibold text-foreground">
              Engagement letter
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Review the letter below (Word format), then sign by entering your authorised signatory name.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReviewLetterId(null)}
            className="icon-btn shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {reviewLetterLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading letter…</p>
          ) : (
            <>
              <EngagementLetterPreview
                content={reviewLetterContent}
                docxUrl={
                  reviewLetterId
                    ? apiAbsoluteUrl(`/api/client/engagement-letters/${reviewLetterId}/docx`)
                    : null
                }
              />
              <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/20">
                <p className="text-sm font-medium text-foreground">Sign & accept</p>
                <label className="block text-sm">
                  <span className="text-muted-foreground">Authorised signatory name</span>
                  <input
                    className="input-field mt-1 w-full"
                    value={letterSignatoryName}
                    onChange={(e) => setLetterSignatoryName(e.target.value)}
                    placeholder="As on company letterhead"
                    disabled={letterAccepting === reviewLetterId}
                  />
                </label>
                {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => setReviewLetterId(null)}>
            Close
          </Button>
          <Button
            variant="success"
            disabled={letterAccepting === reviewLetterId || reviewLetterLoading}
            onClick={() => void acceptEngagementLetter(reviewLetterId)}
          >
            {letterAccepting === reviewLetterId ? 'Signing…' : 'Sign & accept'}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
