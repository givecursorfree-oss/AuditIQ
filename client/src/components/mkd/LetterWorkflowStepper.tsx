import { Check, Clock } from '@phosphor-icons/react';
import { resolveLetterWorkflowDisplay } from '@/lib/engagementStatus';
import { LetterWorkflowStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'approve', label: 'Approve request' },
  { key: 'draft', label: 'Generate letter' },
  { key: 'sent', label: 'Send to client' },
  { key: 'signed', label: 'Client signs' },
] as const;

export type LetterWorkflowStep = (typeof STEPS)[number]['key'];

function stepIndex(letterStatus: string, hasEngagement: boolean, requestStatus: string): number {
  if (requestStatus === 'pending' || requestStatus === 'rejected') return 0;
  if (!hasEngagement) return 0;
  if (letterStatus === 'draft' || letterStatus === 'not_required') return 1;
  if (letterStatus === 'sent') return 2;
  if (letterStatus === 'signed') return 3;
  if (letterStatus === 'rejected') return 1;
  return 0;
}

function nextAction(
  letterStatus: string,
  hasEngagement: boolean,
  requestStatus: string,
  hasLetter: boolean
): { label: string; step: LetterWorkflowStep } | null {
  if (requestStatus === 'pending' || requestStatus === 'rejected' || !hasEngagement) return null;
  if (letterStatus === 'signed') return null;
  if (hasLetter && letterStatus === 'draft') {
    return { label: 'Send to client', step: 'sent' };
  }
  if (!hasLetter || letterStatus === 'not_required' || letterStatus === 'draft' || letterStatus === 'rejected') {
    return { label: 'Generate letter', step: 'draft' };
  }
  return null;
}

function stepCircleClass(done: boolean, active: boolean): string {
  return cn(
    'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
    done && 'border-success bg-success text-white',
    active && !done && 'border-primary bg-primary text-primary-foreground',
    !done && !active && 'border-border bg-muted text-muted-foreground'
  );
}

export function LetterWorkflowStepper({
  requestStatus,
  letterStatus,
  hasEngagement,
  hasLetter = false,
  canAct = false,
  busyAction = null,
  onGenerate,
  onSend,
}: {
  requestStatus: string;
  letterStatus: string;
  hasEngagement: boolean;
  hasLetter?: boolean;
  canAct?: boolean;
  busyAction?: 'generate' | 'send' | null;
  onGenerate?: () => void;
  onSend?: () => void;
}) {
  const current = stepIndex(letterStatus, hasEngagement, requestStatus);
  const action = canAct ? nextAction(letterStatus, hasEngagement, requestStatus, hasLetter) : null;
  const waitingForClient = letterStatus === 'sent' && hasEngagement && requestStatus !== 'pending';
  const workflowDisplay = resolveLetterWorkflowDisplay({ requestStatus, letterStatus, hasEngagement });

  function handleCta() {
    if (!action) return;
    if (action.step === 'draft') onGenerate?.();
    else if (action.step === 'sent') onSend?.();
  }

  const ctaLoading =
    (action?.step === 'draft' && busyAction === 'generate') ||
    (action?.step === 'sent' && busyAction === 'send');

  const ctaLabel = ctaLoading
    ? action?.step === 'draft'
      ? 'Generating…'
      : 'Sending…'
    : action?.label;

  return (
    <div className="space-y-4">
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0" aria-label="Engagement letter workflow">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.key} className="flex min-w-0 flex-1 items-center gap-2">
              <span className={stepCircleClass(done, active)} aria-current={active ? 'step' : undefined}>
                {done ? <Check size={14} weight="bold" aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  'truncate text-xs leading-tight sm:text-[11px]',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="mx-2 hidden h-px min-w-4 flex-1 bg-border sm:block" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Letter status</span>
          <LetterWorkflowStatusBadge context={{ requestStatus, letterStatus, hasEngagement }} />
        </div>
        {waitingForClient ? (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <Clock size={14} aria-hidden />
            Waiting for client signature
          </p>
        ) : (
          action &&
          (onGenerate || onSend) && (
            <Button type="button" size="sm" disabled={!!busyAction} onClick={handleCta}>
              {ctaLabel}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
