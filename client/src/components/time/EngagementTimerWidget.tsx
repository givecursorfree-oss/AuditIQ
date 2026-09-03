import { useMemo } from 'react';
import { Play, Pause, Stop } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { DotmSquare3 } from '@/components/ui/dotm-square-3';
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

function splitDuration(seconds: number): [string, string, string] {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ];
}

function TimerStatusIndicator({
  isRunning,
  isPaused,
  compact,
}: {
  isRunning: boolean;
  isPaused: boolean;
  compact?: boolean;
}) {
  const size = compact ? 12 : 16;
  const dotSize = compact ? 2 : 3;

  if (isRunning) {
    return (
      <DotmSquare3
        size={size}
        dotSize={dotSize}
        colorPreset="solid-mint"
        bloom
        pattern="diamond"
        speed={1.4}
        ariaLabel="Recording"
      />
    );
  }

  if (isPaused) {
    return (
      <DotmSquare3
        size={size}
        dotSize={dotSize}
        color="#f59e0b"
        animated={false}
        pattern="rings"
        ariaLabel="Paused"
      />
    );
  }

  return (
    <DotmSquare3
      size={size}
      dotSize={dotSize}
      muted
      animated={false}
      pattern="outline"
      ariaLabel="Ready"
    />
  );
}

function TimerDigits({
  elapsedSeconds,
  isRunning,
  compact,
}: {
  elapsedSeconds: number;
  isRunning: boolean;
  compact?: boolean;
}) {
  const [hh, mm, ss] = useMemo(() => splitDuration(elapsedSeconds), [elapsedSeconds]);
  const segmentClass = cn(
    'timer-digit-segment',
    compact && 'timer-digit-segment-compact',
  );
  const sepClass = cn('timer-digit-sep', compact && 'timer-digit-sep-compact');
  const formatted = formatDuration(Number.isFinite(elapsedSeconds) ? Math.max(0, Math.floor(elapsedSeconds)) : 0);

  return (
    <div
      className={cn('timer-display', compact && 'timer-display-compact')}
      role="timer"
      aria-label={`${formatted} elapsed`}
    >
      <span className={segmentClass} aria-hidden>{hh}</span>
      <span className={sepClass} aria-hidden>:</span>
      <span className={segmentClass} aria-hidden>{mm}</span>
      <span className={sepClass} aria-hidden>:</span>
      <span className={cn(segmentClass, isRunning && 'timer-digit-seconds-active')} aria-hidden>{ss}</span>
    </div>
  );
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
  const statusLabel = isRunning ? 'Recording' : isPaused ? 'Paused' : 'Ready';
  const showContext = Boolean(engagementName || isRunning || isPaused);

  return (
    <div className={cn('timer-widget', compact && 'timer-widget-compact')}>
      <div className="timer-widget-glow" aria-hidden />

      <div className="relative z-[1] flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <TimerStatusIndicator isRunning={isRunning} isPaused={isPaused} compact={compact} />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
            {statusLabel}
          </span>
        </div>
        {!compact && (
          <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
            Today {formatDuration(dayTotalSeconds)}
          </span>
        )}
      </div>

      {showContext && (
        <div className="relative z-[1] mb-3 min-w-0 text-center">
          <p className="text-sm font-semibold text-foreground truncate">
            {engagementName || 'No engagement selected'}
          </p>
          {engagementStage && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{engagementStage}</p>
          )}
        </div>
      )}

      <div className="relative z-[1]">
        <TimerDigits elapsedSeconds={elapsedSeconds} isRunning={isRunning} compact={compact} />
      </div>

      <div className="relative z-[1] flex flex-wrap gap-2 justify-center mt-5">
        {!isRunning && !isPaused && (
          <Button
            size={compact ? 'sm' : 'default'}
            className="timer-btn-start gap-1.5"
            onClick={onStart}
          >
            <Play size={compact ? 14 : 16} weight="fill" /> Start
          </Button>
        )}
        {isRunning && (
          <>
            <Button size={compact ? 'sm' : 'default'} variant="outline" className="gap-1.5" onClick={onPause}>
              <Pause size={compact ? 14 : 16} weight="fill" /> Pause
            </Button>
            <Button
              size={compact ? 'sm' : 'default'}
              variant="outline"
              className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/5"
              onClick={onStop}
            >
              <Stop size={compact ? 14 : 16} weight="fill" /> Stop & Save
            </Button>
          </>
        )}
        {isPaused && (
          <>
            <Button size={compact ? 'sm' : 'default'} className="timer-btn-start gap-1.5" onClick={onResume}>
              <Play size={compact ? 14 : 16} weight="fill" /> Resume
            </Button>
            <Button
              size={compact ? 'sm' : 'default'}
              variant="outline"
              className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/5"
              onClick={onStop}
            >
              <Stop size={compact ? 14 : 16} weight="fill" /> Stop & Save
            </Button>
          </>
        )}
      </div>

      {compact && (
        <p className="relative z-[1] text-center text-xs text-muted-foreground mt-4">
          Today <strong className="text-foreground">{formatDuration(dayTotalSeconds)}</strong>
        </p>
      )}
    </div>
  );
}
