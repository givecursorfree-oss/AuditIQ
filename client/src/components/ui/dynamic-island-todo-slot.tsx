'use client';

import { memo, type CSSProperties } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ISLAND_EXPANDED_MAX_W,
  type ExpandSpring,
  type IslandTodoPayload,
} from '@/components/ui/dynamic-island-shared';

export const TodoSlot = memo(function TodoSlot({
  data,
  expanded,
  expandSpring,
}: {
  data: IslandTodoPayload;
  expanded: boolean;
  expandSpring: ExpandSpring;
}) {
  const summary =
    data.count === 1 ? '1 open task' : `${data.count} open tasks`;

  return (
    <button
      type="button"
      onClick={() => data.onOpen?.()}
      className={cn(
        'flex min-w-0 items-center gap-2 text-left',
        expanded ? 'max-w-[var(--island-expanded-max)] px-3 py-1.5' : 'px-2.5 py-1',
      )}
      style={
        {
          '--island-expanded-max': ISLAND_EXPANDED_MAX_W,
        } as CSSProperties
      }
      aria-label={expanded ? `Open task: ${data.title}` : `${data.count} open tasks — open`}
    >
      <m.div layout="position" transition={expandSpring}>
        <ListChecks
          className={cn('shrink-0 text-sky-400', expanded ? 'h-4 w-4' : 'h-3.5 w-3.5')}
          aria-hidden
        />
      </m.div>
      <AnimatePresence mode="popLayout" initial={false}>
        {expanded ? (
          <m.div
            key="detail"
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={expandSpring}
            className="min-w-0 flex-1 overflow-hidden"
          >
            <p className="truncate text-xs font-semibold text-white">{summary}</p>
            <p className="truncate text-[11px] leading-tight text-white/70">{data.title}</p>
            {data.subtitle ? (
              <p className="truncate text-[10px] leading-tight text-white/45">{data.subtitle}</p>
            ) : null}
          </m.div>
        ) : (
          <m.span
            key="count"
            layout
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={expandSpring}
            className="text-xs font-semibold tabular-nums text-white"
          >
            {data.count}
          </m.span>
        )}
      </AnimatePresence>
    </button>
  );
});
