import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CLIENT_PROGRESS_STEPS,
  CLIENT_STAGE_DESCRIPTIONS,
  getClientProgressStepIndex,
} from '@/lib/engagementProgress';
import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/ui/stepper';

type EngagementProgressStepperProps = {
  currentStage: string;
  stepIndex?: number;
  stepLabels?: string[];
  stageDescription?: string;
  className?: string;
};

export function EngagementProgressStepper({
  currentStage,
  stepIndex,
  stepLabels,
  stageDescription,
  className,
}: EngagementProgressStepperProps) {
  const labels = stepLabels ?? CLIENT_PROGRESS_STEPS.map((s) => s.label);
  const idx = stepIndex ?? getClientProgressStepIndex(currentStage);
  const activeStep = idx + 1;
  const description =
    stageDescription ||
    CLIENT_STAGE_DESCRIPTIONS[currentStage] ||
    'Your engagement is in progress.';

  return (
    <div className={cn('w-full', className)}>
      <Stepper
        value={activeStep}
        onValueChange={() => {}}
        indicators={{
          completed: <Check className="size-3.5" strokeWidth={2.5} aria-hidden />,
        }}
        className="w-full space-y-4"
        aria-label="Engagement progress"
      >
        <StepperNav className="w-full items-start">
          {labels.map((label, index) => (
            <StepperItem
              key={`${label}-${index}`}
              step={index + 1}
              completed={index < idx}
              className="min-w-0 flex-1 flex-col items-stretch"
            >
              <div className="flex w-full items-center">
                <StepperTrigger
                  tabIndex={-1}
                  className="mx-auto flex shrink-0 flex-col items-center px-1"
                  aria-label={`${label}${index === idx ? ', current step' : index < idx ? ', completed' : ''}`}
                >
                  <StepperIndicator className="data-[state=active]:border-success data-[state=active]:bg-success data-[state=active]:text-white">
                    {index >= idx ? <span>{index + 1}</span> : null}
                  </StepperIndicator>
                </StepperTrigger>
                {index < labels.length - 1 && (
                  <StepperSeparator className="mx-1 mb-0 min-w-2 flex-1" aria-hidden />
                )}
              </div>
              <StepperTitle className="mt-2 w-full px-0.5 text-center leading-snug">
                {label}
              </StepperTitle>
            </StepperItem>
          ))}
        </StepperNav>

        <StepperPanel>
          <StepperContent value={activeStep}>
            <p className="rounded-lg border border-border bg-surface/50 px-4 py-3 text-sm leading-relaxed text-foreground-secondary">
              {description}
            </p>
          </StepperContent>
        </StepperPanel>
      </Stepper>
    </div>
  );
}
