'use client';

import { useState, type ReactNode } from 'react';
import { m } from 'motion/react';
import { cn } from '@/lib/utils';
import { NotificationSlot } from '@/components/ui/dynamic-island-notification-slot';
import { TimerSlot } from '@/components/ui/dynamic-island-timer-slot';
import { TodoSlot } from '@/components/ui/dynamic-island-todo-slot';
import {
  EXPAND_SPRING,
  ISLAND_COLLAPSED_MAX_W,
  shellSpring,
  type DynamicIslandProps,
  type ExpandSpring,
} from '@/components/ui/dynamic-island-shared';

export function DynamicIslandViewShell({
  view,
  className,
  notification,
  timer,
  todo,
  visible,
  viewSpring,
  expandSpring,
  shouldReduceMotion,
}: Omit<DynamicIslandProps, 'visible'> &
  Required<Pick<DynamicIslandProps, 'visible'>> & {
  viewSpring: ReturnType<typeof shellSpring>;
  expandSpring: ExpandSpring;
  shouldReduceMotion: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [peek, setPeek] = useState(false);

  const isNotification = view === 'notification' && !!notification;
  const isExpanded = isNotification || hovered || peek;
  const openPeek = () => setPeek(true);

  let content: ReactNode = null;
  if (view === 'timer' && timer) {
    content = (
      <TimerSlot
        data={timer}
        expanded={isExpanded}
        onPeek={!isExpanded ? openPeek : undefined}
        expandSpring={expandSpring}
      />
    );
  } else if (isNotification && notification) {
    content = <NotificationSlot data={notification} />;
  } else if (view === 'todo' && todo) {
    content = (
      <TodoSlot
        data={todo}
        expanded={isExpanded}
        expandSpring={expandSpring}
      />
    );
  }

  if (!visible || view === 'idle' || !content) return null;

  return (
    <div
      className={cn('pointer-events-none flex w-full justify-center', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        if (!isNotification) setPeek(false);
      }}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setHovered(false);
          if (!isNotification) setPeek(false);
        }
      }}
    >
      <m.div
        layout
        transition={isExpanded && !isNotification ? expandSpring : viewSpring}
        style={{
          borderRadius: 9999,
          maxWidth: isExpanded ? 'min(100vw - 2rem, 20rem)' : ISLAND_COLLAPSED_MAX_W,
        }}
        className="pointer-events-auto mx-auto w-fit overflow-hidden rounded-full bg-zinc-950 shadow-[0_8px_32px_rgba(0,0,0,0.35)] ring-1 ring-white/12 transform-gpu will-change-[width]"
      >
        <m.div
          key={view}
          layout={false}
          initial={
            shouldReduceMotion
              ? false
              : {
                  scale: 0.9,
                  opacity: 0,
                }
          }
          animate={{
            scale: 1,
            opacity: 1,
          }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : {
                  ...viewSpring,
                  delay: 0.05,
                }
          }
          style={{ transformOrigin: '50% 50%' }}
        >
          {content}
        </m.div>
      </m.div>
    </div>
  );
}

export { EXPAND_SPRING };
