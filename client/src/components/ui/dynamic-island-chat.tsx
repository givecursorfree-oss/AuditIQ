import { useState, useMemo, useEffect, type CSSProperties } from 'react';
import { m, AnimatePresence, useMotionValue, type Transition } from 'motion/react';
import { X, Plus } from 'lucide-react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import UserPresenceAvatar from '@/components/UserPresenceAvatar';
import { normalizePresenceStatus } from '@/lib/presence';
import { useSidebar } from '@/components/ui/sidebar';

export type IslandChatRoom = {
  id: string;
  name?: string;
  type: 'DM' | 'GROUP' | 'CHANNEL';
  engagementId?: string | null;
  participants: {
    userId: string;
    user: {
      id: string;
      name: string;
      email: string;
      initials: string;
      presenceStatus?: 'online' | 'offline' | 'maintenance' | 'degraded';
    };
  }[];
  lastMessage?: { id?: string; content?: string; type: string; createdAt: string; senderId?: string; sender?: { name?: string } } | null;
  unreadCount: number;
};

const islandTransition: Transition = {
  type: 'tween',
  ease: [0.22, 1, 0.36, 1],
  duration: 0.5,
};

/** Expanded panel — large enough to scan conversations comfortably */
const ISLAND_COLLAPSED = { width: 300, height: 52 };
const ISLAND_EXPANDED = { width: 520, height: 560 };

function CircleProgress({ percentage }: { percentage: number }) {
  const size = 24;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--muted)" strokeWidth={strokeWidth} />
      <m.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        strokeLinecap="round"
      />
    </svg>
  );
}

type RoomFilter = 'all' | 'engagement' | 'direct';

type DynamicIslandChatProps = {
  rooms: IslandChatRoom[];
  activeRoomId: string | null;
  userId: string;
  isClient: boolean;
  roomFilter?: RoomFilter;
  onRoomFilterChange?: (f: RoomFilter) => void;
  search: string;
  onSearchChange: (q: string) => void;
  onSelectRoom: (room: IslandChatRoom) => void;
  onNewChat?: () => void;
  onOpenFullChat?: () => void;
  getRoomName: (room: IslandChatRoom, userId: string) => string;
  getRoomSubtitle: (room: IslandChatRoom, userId: string) => string;
  /** Collapsed pill label when no room selected */
  emptyLabel?: string;
  /** Expanded panel header (TABLE OF CONTENTS style) */
  headerLabel?: string;
};

export function DynamicIslandChat({
  rooms,
  activeRoomId,
  userId,
  isClient,
  roomFilter = 'all',
  onRoomFilterChange,
  search,
  onSearchChange,
  onSelectRoom,
  onNewChat,
  onOpenFullChat,
  getRoomName,
  getRoomSubtitle,
  emptyLabel,
  headerLabel: headerLabelProp,
}: DynamicIslandChatProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { isMobile, state: sidebarState } = useSidebar();

  // Draggable position for the collapsed pill so it never permanently blocks
  // content beneath it. Reset to centre when the panel expands.
  // ponytail: fixed drag bounds (±360px horizontal, up to 480px upward) rather
  // than measuring the viewport on every drag — upgrade to ref-based
  // dragConstraints if multi-monitor/zoom edge cases surface.
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  useEffect(() => {
    if (isExpanded) {
      dragX.set(0);
      dragY.set(0);
    }
  }, [isExpanded, dragX, dragY]);

  /** Pin to main content column; flex centering avoids fighting Framer Motion's transform. */
  const islandInsetStyle: CSSProperties = isMobile
    ? { left: 0, right: 0 }
    : {
        left:
          sidebarState === 'collapsed' ? 'var(--sidebar-width-icon)' : 'var(--sidebar-width)',
        right: 0,
      };

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const activeName = activeRoom
    ? getRoomName(activeRoom, userId)
    : emptyLabel || (isClient ? 'Your advisor' : 'Messages');

  const totalUnread = useMemo(() => rooms.reduce((s, r) => s + r.unreadCount, 0), [rooms]);
  const unreadProgress = totalUnread > 0 ? Math.min(100, (totalUnread / Math.max(rooms.length, 1)) * 100) : 0;

  const headerLabel = headerLabelProp || (isClient ? 'YOUR TEAM CHATS' : 'CONVERSATIONS');

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExpanded]);

  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      const name = getRoomName(r, userId).toLowerCase();
      const sub = getRoomSubtitle(r, userId).toLowerCase();
      if (search && !name.includes(search.toLowerCase()) && !sub.includes(search.toLowerCase())) return false;
      if (isClient) return !!r.engagementId;
      if (roomFilter === 'engagement') return !!r.engagementId;
      if (roomFilter === 'direct') return !r.engagementId && r.type === 'DM';
      return true;
    });
  }, [rooms, search, isClient, roomFilter, userId, getRoomName, getRoomSubtitle]);

  const minEngagementIndent = 0;

  return (
    <>
      <AnimatePresence>
        {isExpanded && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={islandTransition}
            className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-[4px]"
            onClick={() => setIsExpanded(false)}
            aria-hidden
          />
        )}
      </AnimatePresence>

      <m.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="fixed z-[9999] flex justify-center px-3 pointer-events-none sm:px-4"
        style={{
          ...islandInsetStyle,
          bottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <m.div
          initial={false}
          animate={{
            width: isExpanded ? '100%' : 'auto',
            height: isExpanded ? ISLAND_EXPANDED.height : ISLAND_COLLAPSED.height,
            borderRadius: isExpanded ? 20 : 26,
          }}
          transition={islandTransition}
          drag={!isExpanded}
          dragMomentum={false}
          dragElastic={0.12}
          dragConstraints={{ top: -480, bottom: 8, left: -360, right: 360 }}
          whileDrag={{ scale: 1.03 }}
          style={{ x: dragX, y: dragY, touchAction: 'none' }}
          className={cn(
            'pointer-events-auto relative mx-auto overflow-hidden border border-border bg-card text-foreground shadow-xl',
            isExpanded ? 'w-full max-w-[min(520px,calc(100vw-1.5rem))]' : 'w-max max-w-[calc(100vw-1.5rem)] cursor-grab active:cursor-grabbing'
          )}
        >
          {/* Collapsed pill — button for keyboard and screen reader access */}
          {!isExpanded ? (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              aria-label={
                totalUnread > 0
                  ? `Open messages, ${totalUnread} unread`
                  : `Open messages, ${activeName}`
              }
              aria-expanded={false}
              aria-haspopup="dialog"
              className="flex h-[52px] w-full items-center justify-center gap-2.5 px-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <div className="size-2 shrink-0 rounded-full bg-foreground" aria-hidden />
              <div className="relative min-w-0 max-w-[min(12rem,calc(100vw-8rem))] overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  <m.span
                    key={activeRoomId || 'empty'}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="block truncate whitespace-nowrap text-sm font-medium text-foreground"
                  >
                    {activeName}
                    {totalUnread > 0 ? ` · ${totalUnread} new` : ''}
                  </m.span>
                </AnimatePresence>
              </div>
              <CircleProgress percentage={unreadProgress} />
            </button>
          ) : (
            <m.div
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-label={headerLabel}
            >
            <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
              <span className="label-caps text-foreground-secondary">
                {headerLabel}
              </span>
              <div className="flex items-center gap-1">
                {onOpenFullChat && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenFullChat();
                      setIsExpanded(false);
                    }}
                    className="text-[10px] font-semibold text-primary px-2 py-1 rounded-md hover:bg-primary/10"
                  >
                    Open chat
                  </button>
                )}
                {!isClient && onNewChat && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNewChat();
                      setIsExpanded(false);
                    }}
                    className="p-1 text-primary hover:bg-primary/10 rounded-md transition-colors"
                    title="New conversation"
                    aria-label="New conversation"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                  }}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Close messages"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="shrink-0 px-4 pb-2 sm:px-5">
              <div className="relative">
                <MagnifyingGlass
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder={isClient ? 'Search your team…' : 'Search conversations…'}
                  aria-label={isClient ? 'Search your team' : 'Search conversations'}
                  className="input-field h-10 w-full pl-9 text-sm"
                />
              </div>
              {!isClient && onRoomFilterChange && (
                <div className="flex gap-1 mt-2">
                  {([['all', 'All'], ['engagement', 'Engagements'], ['direct', 'Direct']] as const).map(
                    ([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRoomFilterChange(key);
                        }}
                        className={cn(
                          'flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors',
                          roomFilter === key
                            ? 'bg-foreground/10 font-medium text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                        )}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-4" data-lenis-prevent="true">
              {filtered.length === 0 ? (
                <p className="text-sm text-foreground/45 text-center py-8 px-2">
                  {isClient
                    ? 'No team chat yet. Your advisor will appear once an engagement is assigned.'
                    : 'No conversations match your search.'}
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {filtered.map((room) => {
                    const isActive = activeRoomId === room.id;
                    const isHovered = hoveredId === room.id;
                    const name = getRoomName(room, userId);
                    const sub = getRoomSubtitle(room, userId);
                    const peer =
                      room.type === 'DM'
                        ? room.participants.find((p) => p.userId !== userId)?.user
                        : undefined;
                    const indentLevel = room.engagementId ? 1 : minEngagementIndent;
                    const paddingLeft = indentLevel * 14 + 12;

                    return (
                      <button
                        key={room.id}
                        type="button"
                        onMouseEnter={() => setHoveredId(room.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRoom(room);
                          setIsExpanded(false);
                        }}
                        style={{ paddingLeft: `${paddingLeft}px` }}
                        className={cn(
                          'group flex w-full shrink-0 cursor-pointer items-center gap-2 rounded-lg border-none py-2 pr-3 text-left text-sm transition-all duration-300 ease-out',
                          isActive && 'bg-foreground/10 font-medium text-foreground',
                          !isActive && isHovered && 'bg-foreground/5 text-foreground/85',
                          !isActive && !isHovered && 'bg-transparent text-foreground/45'
                        )}
                      >
                        {peer && (
                          <UserPresenceAvatar
                            userId={peer.id}
                            initials={peer.initials}
                            presenceStatus={normalizePresenceStatus(peer.presenceStatus)}
                            size="sm"
                            className="shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap transition-transform duration-300 group-hover:translate-x-1 block font-medium">
                            {name}
                          </span>
                          <span className="block truncate text-[11px] opacity-80">{sub}</span>
                        </div>
                        {room.unreadCount > 0 && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center">
                            {room.unreadCount}
                          </span>
                        )}
                        <m.div
                          initial={false}
                          animate={{ scale: isActive ? 1 : 0, opacity: isActive ? 1 : 0 }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                          className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </m.div>
          )}
        </m.div>
      </m.div>
    </>
  );
}
