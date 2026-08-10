'use client';

import { memo } from 'react';
import { Briefcase, X } from 'lucide-react';
import type { IslandNotificationPayload } from '@/components/ui/dynamic-island-shared';

export const NotificationSlot = memo(function NotificationSlot({
  data,
}: {
  data: IslandNotificationPayload;
}) {
  return (
    <div className="flex w-[min(100vw-2rem,20rem)] items-center gap-2 px-3 py-1.5 sm:w-[21rem]">
      <button
        type="button"
        onClick={data.onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-[10px] font-semibold text-white">
          {data.senderInitials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium text-white">{data.senderName}</p>
            <span className="shrink-0 text-[10px] text-white/50">{data.timeLabel}</span>
          </div>
          {data.context ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-white/55">
              <Briefcase className="h-3 w-3 shrink-0 text-white/40" aria-hidden />
              <span className="truncate">{data.context}</span>
            </p>
          ) : null}
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/85">{data.message}</p>
        </div>
      </button>
      {data.onDismiss ? (
        <button
          type="button"
          onClick={data.onDismiss}
          className="shrink-0 rounded-md p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-white/80"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
});
