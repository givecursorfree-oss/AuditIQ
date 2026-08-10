import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  FileText,
  X,
} from '@phosphor-icons/react';
import { FY_OPTIONS, MKD_CLIENT_SERVICES, REQ_STEP_LABELS } from './constants';
import { useClientPortal } from './ClientPortalContext';

export function ClientPortalRequestModal() {
  const {
    showRequestForm,
    closeRequestForm,
    reqSuccess,
    profile,
    setActiveTab,
    reqStep,
    reqError,
    submitEngagementRequest,
    reqForm,
    setReqForm,
    toggleService,
    reqSaving,
    setReqStep,
  } = useClientPortal();

  if (!showRequestForm) return null;

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 flex max-h-none max-w-none items-center justify-center border-0 bg-black/50 p-4 backdrop-blur-sm"
      aria-labelledby="engagement-request-title"
      onClick={closeRequestForm}
      onKeyDown={(e) => {
        if (e.key === 'Escape') closeRequestForm();
      }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {reqSuccess ? (
          <div className="p-6 text-center space-y-4">
            <CheckCircle size={48} className="mx-auto text-success" weight="fill" />
            <h2 id="engagement-request-title" className="text-lg font-semibold text-foreground">
              Request submitted
            </h2>
            <p className="text-sm text-muted-foreground text-left max-w-sm mx-auto">
              Your request is with{' '}
              <strong className="text-foreground">{profile?.clientName ?? 'your CA firm'}</strong> for review.
              When approved, an engagement letter will be sent to{' '}
              <strong className="text-foreground">this dashboard</strong> — open it here to review and sign.
            </p>
            <ul className="text-left text-sm text-muted-foreground space-y-2 max-w-sm mx-auto pt-2">
              <li className="flex gap-2">
                <CheckCircle size={18} className="text-success shrink-0 mt-0.5" weight="fill" />
                <span>
                  Request received — track under the <strong className="text-foreground">Requests</strong> tab
                </span>
              </li>
              <li className="flex gap-2">
                <FileText size={18} className="text-primary shrink-0 mt-0.5" />
                <span>
                  Engagement letter will appear on this dashboard for you to{' '}
                  <strong className="text-foreground">check and sign</strong>
                </span>
              </li>
              <li className="flex gap-2">
                <Clock size={18} className="text-warning shrink-0 mt-0.5" />
                <span>After signing, your team is assigned and work begins</span>
              </li>
            </ul>
            <Button
              onClick={() => {
                closeRequestForm();
                setActiveTab('requests');
              }}
              className="mt-2 min-w-[160px]"
            >
              View my requests
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
              <div>
                <h2 id="engagement-request-title" className="text-lg font-semibold text-foreground">
                  Request New Engagement
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Step {reqStep} of 3 — {REQ_STEP_LABELS[reqStep - 1]}
                </p>
              </div>
              <button type="button" onClick={closeRequestForm} className="icon-btn shrink-0" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 pt-4">
              <div className="flex gap-2 mb-5" aria-hidden>
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      step <= reqStep ? 'bg-primary' : 'bg-border'
                    }`}
                  />
                ))}
              </div>

              {reqError && (
                <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
                  {reqError}
                </div>
              )}

              <form onSubmit={submitEngagementRequest} className="space-y-4">
                {reqStep === 1 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Select one or more services</p>
                    <div className="space-y-2 max-h-[min(52vh,420px)] overflow-y-auto pr-1">
                      {MKD_CLIENT_SERVICES.map((s) => {
                        const selected = reqForm.selectedServices.includes(s.code);
                        return (
                          <button
                            key={s.code}
                            type="button"
                            role="checkbox"
                            aria-checked={selected}
                            onClick={() => toggleService(s.code)}
                            className={`w-full flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors ${
                              selected
                                ? 'border-foreground/30 bg-surface-muted ring-1 ring-border'
                                : 'border-border bg-card hover:border-primary/40 hover:bg-hover-bg'
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                                selected ? 'border-primary bg-primary text-white' : 'border-foreground-muted'
                              }`}
                              aria-hidden
                            >
                              {selected && <CheckCircle size={12} weight="bold" />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-semibold text-foreground">{s.label}</span>
                              <span className="block text-xs text-muted-foreground mt-0.5">{s.description}</span>
                              <span className="block text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">
                                {s.group}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {reqStep === 2 && (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="portal-request-fy" className="block text-sm font-medium text-foreground mb-1.5">Financial year</label>
                      <select
                        id="portal-request-fy"
                        aria-label="Financial year"
                        value={reqForm.financialYear}
                        onChange={(e) => setReqForm({ ...reqForm, financialYear: e.target.value })}
                        className="input-field w-full"
                      >
                        {FY_OPTIONS.map((fy) => (
                          <option key={fy} value={fy}>
                            {fy}
                          </option>
                        ))}
                      </select>
                    </div>
                    {reqForm.financialYear === 'Other' && (
                      <input
                        className="input-field w-full"
                        aria-label="Custom financial year"
                        placeholder="e.g. 2022-23"
                        value={reqForm.customYear}
                        onChange={(e) => setReqForm({ ...reqForm, customYear: e.target.value })}
                      />
                    )}
                    <div>
                      <label htmlFor="portal-request-notes" className="block text-sm font-medium text-foreground mb-1.5">
                        Notes for the firm{' '}
                        <span className="text-muted-foreground font-normal">(optional)</span>
                      </label>
                      <textarea
                        id="portal-request-notes"
                        aria-label="Notes for the firm"
                        className="input-field w-full"
                        rows={3}
                        placeholder="Scope, entity details, or special instructions"
                        value={reqForm.notes}
                        onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {reqStep === 3 && (
                  <div className="space-y-3 text-sm rounded-lg border border-border bg-surface-muted p-4 text-foreground">
                    <p>
                      <span className="font-medium text-foreground-secondary">Services:</span>{' '}
                      {reqForm.selectedServices
                        .map((code) => MKD_CLIENT_SERVICES.find((s) => s.code === code)?.label ?? code)
                        .join(', ')}
                    </p>
                    <p>
                      <span className="font-medium text-foreground-secondary">Financial year:</span>{' '}
                      {reqForm.financialYear === 'Other' ? reqForm.customYear : reqForm.financialYear}
                    </p>
                    {reqForm.notes && (
                      <p>
                        <span className="font-medium text-foreground-secondary">Notes:</span> {reqForm.notes}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={closeRequestForm} className="sm:min-w-[100px]">
                    Cancel
                  </Button>
                  {reqStep > 1 && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setReqStep((s) => s - 1)}
                      className="sm:min-w-[100px]"
                    >
                      <ArrowLeft size={16} className="mr-1.5" />
                      Back
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={reqSaving || (reqStep === 1 && reqForm.selectedServices.length === 0)}
                    className="sm:min-w-[140px]"
                  >
                    {reqSaving ? (
                      'Submitting…'
                    ) : reqStep < 3 ? (
                      <>
                        Continue
                        <ArrowRight size={16} className="ml-1.5" />
                      </>
                    ) : (
                      'Submit request'
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
