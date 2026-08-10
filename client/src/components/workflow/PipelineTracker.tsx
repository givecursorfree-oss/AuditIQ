import { Check, Circle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { WorkflowStepView } from '@/types/workflowEngagement';

interface PipelineTrackerProps {
  steps: WorkflowStepView[];
  currentStageCode: string;
  completedStageCodes?: string[];
  compact?: boolean;
  onStageClick?: (step: WorkflowStepView) => void;
  dataRequestPercent?: number;
}

export default function PipelineTracker({
  steps,
  currentStageCode,
  completedStageCodes = [],
  compact = false,
  onStageClick,
  dataRequestPercent,
}: PipelineTrackerProps) {
  const currentIdx = Math.max(0, steps.findIndex((s) => s.code === currentStageCode));
  const completedSet = new Set(completedStageCodes);

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div
        className={cn(
          'flex min-w-max items-center gap-0',
          compact ? 'gap-0' : 'gap-0'
        )}
      >
        {steps.map((step, idx) => {
          const isCompleted = completedSet.has(step.code) || idx < currentIdx;
          const isActive = step.code === currentStageCode;
          const isClickable = Boolean(onStageClick) && (isCompleted || isActive);

          return (
            <div key={step.code} className="flex items-center">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStageClick?.(step)}
                className={cn(
                  'group flex flex-col items-center gap-1 px-1 sm:px-2',
                  isClickable && 'cursor-pointer',
                  !isClickable && 'cursor-default'
                )}
                title={step.label}
              >
                <div
                  className={cn(
                    'flex size-6 sm:size-7 items-center justify-center rounded-full border-2 text-[10px] font-semibold transition-colors',
                    isCompleted && 'border-teal-500 bg-teal-500 text-white',
                    isActive && !isCompleted && 'border-amber-500 bg-amber-500 text-white ring-2 ring-amber-500/30',
                    !isCompleted && !isActive && 'border-border bg-muted text-foreground-muted'
                  )}
                >
                  {isCompleted ? (
                    <Check size={12} weight="bold" />
                  ) : isActive ? (
                    <Circle size={10} weight="fill" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    'max-w-[4.5rem] sm:max-w-[5.5rem] text-center text-[9px] sm:text-[10px] leading-tight',
                    isActive ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-foreground-muted',
                    isCompleted && 'text-teal-700 dark:text-teal-400'
                  )}
                >
                  {step.label}
                  {step.code === 'DATA_REQUEST' && dataRequestPercent != null && isActive && (
                    <span className="block text-[8px] text-foreground-muted">{dataRequestPercent}% received</span>
                  )}
                </span>
              </button>
              {idx < steps.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 w-3 sm:w-5 shrink-0 rounded-full',
                    idx < currentIdx ? 'bg-teal-500' : 'bg-border'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
