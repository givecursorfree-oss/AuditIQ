'use client';

import { memo, type CSSProperties } from 'react';
import { m } from 'motion/react';
import { Square, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ISLAND_EXPANDED_MAX_W,
  useElapsedClock,
  type ExpandSpring,
  type IslandTimerPayload,
} from '@/components/ui/dynamic-island-shared';

export const TimerSlot = memo(function TimerSlot({
  data,
  expanded,
  onPeek,
  expandSpring,
}: {
  data: IslandTimerPayload;
  expanded: boolean;
  onPeek?: () => void;
  expandSpring: ExpandSpring;
}) {
  const { labelRef, barRef } = useElapsedClock(
    data.startedAt,
    data.isPaused,
    data.elapsedSeconds,
  );

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5',
        expanded ? 'max-w-[var(--island-expanded-max)] px-3 py-1.5' : 'px-2.5 py-1',
      )}
      style={
        {
          '--island-expanded-max': ISLAND_EXPANDED_MAX_W,
        } as CSSProperties
      }
    >
      <button
        type="button"
        onClick={() => {
          if (onPeek) {
            onPeek();
            return;
          }
          data.onOpen?.();
        }}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-label={expanded ? 'Open time tracker' : 'Running timer — tap to expand'}
      >
        <Timer
          className={cn('shrink-0 text-amber-400', expanded ? 'h-4 w-4' : 'h-3.5 w-3.5')}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <span
            ref={labelRef}
            className={cn(
              'block font-mono font-semibold tabular-nums tracking-tight text-white',
              expanded ? 'text-sm' : 'text-xs',
              data.isPaused && 'opacity-70',
            )}
          >
            00:00:00
          </span>
          <m.p
            initial={false}
            animate={{
              opacity: expanded ? 1 : 0,
              height: expanded ? 'auto' : 0,
              marginTop: expanded ? 2 : 0,
            }}
            transition={expandSpring}
            className="overflow-hidden truncate text-[11px] text-white/55"
          >
            {data.isPaused ? `Paused · ${data.subtitle}` : data.subtitle}
          </m.p>
        </div>
        <m.div
          initial={false}
          animate={{
            opacity: expanded ? 1 : 0,
            width: expanded ? 48 : 0,
          }}
          transition={expandSpring}
          className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-white/15"
        >
          <div
            ref={barRef}
            className={cn(
              'h-full bg-amber-400/90 transition-[width] duration-300 ease-linear',
              data.isPaused && 'opacity-40',
            )}
            style={{ width: '0%' }}
          />
        </m.div>
      </button>
      {data.onStop ? (
        <m.button
          type="button"
          layout="position"
          initial={false}
          animate={{
            opacity: expanded ? 1 : 0,
            scale: expanded ? 1 : 0.85,
            width: expanded ? 28 : 0,
          }}
          transition={expandSpring}
          disabled={data.stopping}
          onClick={(e) => {
            e.stopPropagation();
            void data.onStop?.();
          }}
          className={cn(
            'flex h-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-red-500/90 text-white transition-colors hover:bg-red-500 disabled:opacity-50',
            !expanded && 'pointer-events-none',
          )}
          aria-label="Stop timer and log time"
          title="Stop & log"
        >
          <Square className="h-3 w-3 fill-current" aria-hidden />
        </m.button>
      ) : null}
    </div>
  );
});
