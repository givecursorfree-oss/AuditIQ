import { Play, Pause, Stop } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/time';

interface EngagementTimerWidgetProps {
  engagementName: string;
  engagementStage: string;
  elapsedSeconds: number;
  dayTotalSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  compact?: boolean;
}

export default function EngagementTimerWidget({
  engagementName,
  engagementStage,
  elapsedSeconds,
  dayTotalSeconds,
  isRunning,
  isPaused,
  onStart,
  onPause,
  onResume,
  onStop,
  compact = false,
}: EngagementTimerWidgetProps) {
  const statusLabel = isRunning ? 'Recording' : isPaused ? 'Paused' : 'Stopped';
  const dotClass = isRunning ? 'timer-dot-active' : isPaused ? 'timer-dot-paused' : 'timer-dot-stopped';

  return (
    <div className={cn('timer-widget', compact && 'timer-widget-compact')}>
      <div className="flex items-center gap-2 mb-3">
        <span className={cn('timer-status-dot', dotClass)} aria-hidden />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{statusLabel}</span>
      </div>

      {(engagementName || isRunning || isPaused) && (
        <div className="mb-3 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{engagementName || 'No engagement selected'}</p>
          {engagementStage && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{engagementStage}</p>
          )}
        </div>
      )}

      <div className="timer-display tabular-nums">{formatDuration(elapsedSeconds)}</div>

      <div className="flex flex-wrap gap-2 justify-center mt-4">
        {!isRunning && !isPaused && (
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={onStart}>
            <Play size={14} weight="fill" /> Start
          </Button>
        )}
        {isRunning && (
          <>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onPause}>
              <Pause size={14} weight="fill" /> Pause
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/40" onClick={onStop}>
              <Stop size={14} weight="fill" /> Stop & Save
            </Button>
          </>
        )}
        {isPaused && (
          <>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={onResume}>
              <Play size={14} weight="fill" /> Resume
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/40" onClick={onStop}>
              <Stop size={14} weight="fill" /> Stop & Save
            </Button>
          </>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4">
        Today total: <strong className="text-foreground">{formatDuration(dayTotalSeconds)}</strong>
      </p>
    </div>
  );
}
