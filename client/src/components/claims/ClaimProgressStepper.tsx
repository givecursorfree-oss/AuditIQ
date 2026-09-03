import { Check, X } from '@phosphor-icons/react';
import { DotmSquare3 } from '@/components/ui/dotm-square-3';
import { cn } from '@/lib/utils';
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/ui/stepper';
import {
  claimProgressSteps,
  claimStaffProgressSteps,
  type ClaimProgressStep,
  type StaffClaimRow,
} from '@/lib/expenseClaims';

function stepIndex(steps: ClaimProgressStep[]): number {
  const active = steps.findIndex((s) => s.state === 'active');
  if (active >= 0) return active + 1;
  const failed = steps.findIndex((s) => s.state === 'failed');
  if (failed >= 0) return failed + 1;
  const firstInactive = steps.findIndex((s) => s.state === 'inactive');
  if (firstInactive >= 0) return firstInactive + 1;
  return steps.length;
}

function StepIcon({ step }: { step: ClaimProgressStep }) {
  if (step.state === 'completed') return <Check size={14} weight="bold" aria-hidden />;
  if (step.state === 'failed') return <X size={14} weight="bold" aria-hidden />;
  if (step.state === 'active') return <DotmSquare3 size={14} dotSize={2} aria-label={`${step.label} in progress`} />;
  return null;
}

export function ClaimProgressStepper({
  claim,
  audience = 'manager',
}: {
  claim: StaffClaimRow;
  audience?: 'manager' | 'staff';
}) {
  const steps = audience === 'staff' ? claimStaffProgressSteps(claim) : claimProgressSteps(claim);
  const activeStep = stepIndex(steps);

  return (
    <Stepper
      value={activeStep}
      onValueChange={() => {}}
      className="w-full"
      aria-label="Claim progress"
    >
      <StepperNav className="w-full items-start">
        {steps.map((step, index) => (
          <StepperItem
            key={step.key}
            step={index + 1}
            completed={step.state === 'completed'}
            className="min-w-0 flex-1 flex-col items-stretch"
          >
            <div className="flex w-full items-center">
              <StepperTrigger
                tabIndex={-1}
                className="mx-auto flex shrink-0 flex-col items-center px-0.5 pointer-events-none"
                aria-label={step.label}
              >
                <StepperIndicator
                  className={cn(
                    'size-6 sm:size-7 text-[10px]',
                    step.state === 'failed' &&
                      'border-destructive bg-destructive/10 text-destructive data-[state=active]:border-destructive',
                    step.state === 'completed' &&
                      'border-success bg-success text-white data-[state=completed]:border-success data-[state=completed]:bg-success',
                    step.state === 'active' &&
                      'border-primary bg-card text-primary data-[state=active]:bg-card data-[state=active]:text-primary'
                  )}
                >
                  {step.state === 'inactive' ? <span>{index + 1}</span> : <StepIcon step={step} />}
                </StepperIndicator>
              </StepperTrigger>
              {index < steps.length - 1 && (
                <StepperSeparator
                  className={cn(
                    'mx-0.5 min-w-2 flex-1',
                    step.state === 'completed' && 'bg-success/40'
                  )}
                  aria-hidden
                />
              )}
            </div>
            <StepperTitle className="mt-1.5 w-full truncate px-0 text-center text-[10px] sm:text-[11px]">
              {step.label}
            </StepperTitle>
          </StepperItem>
        ))}
      </StepperNav>
    </Stepper>
  );
}
