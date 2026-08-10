'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { DynamicIslandViewShell, EXPAND_SPRING } from '@/components/ui/dynamic-island-view-shell';
import {
  BOUNCE_VARIANTS,
  DEFAULT_BOUNCE,
  shellSpring,
  type DynamicIslandProps,
} from '@/components/ui/dynamic-island-shared';

export type {
  DynamicIslandProps,
  IslandNotificationPayload,
  IslandTimerPayload,
  IslandTodoPayload,
  IslandView,
} from '@/components/ui/dynamic-island-shared';

function DynamicIslandInner({
  view,
  className,
  notification,
  timer,
  todo,
  visible = true,
}: DynamicIslandProps) {
  const shouldReduceMotion = useReducedMotion();
  const prevViewRef = useRef(view);
  const [variantKey, setVariantKey] = useState('idle');

  useEffect(() => {
    if (prevViewRef.current === view) return;
    setVariantKey(`${prevViewRef.current}-${view}`);
    prevViewRef.current = view;
  }, [view]);

  const bounce = BOUNCE_VARIANTS[variantKey] ?? DEFAULT_BOUNCE;
  const viewSpring = shellSpring(bounce, !!shouldReduceMotion);
  const expandSpring = shouldReduceMotion ? { duration: 0 } : EXPAND_SPRING;

  return (
    <DynamicIslandViewShell
      key={view}
      view={view}
      className={className}
      notification={notification}
      timer={timer}
      todo={todo}
      visible={visible}
      viewSpring={viewSpring}
      expandSpring={expandSpring}
      shouldReduceMotion={!!shouldReduceMotion}
    />
  );
}

export const DynamicIsland = memo(DynamicIslandInner);
