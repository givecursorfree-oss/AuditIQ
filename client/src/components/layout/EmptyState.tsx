import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Empty-state PNGs in /illustrations/empty/ — map by metaphor, not decoration. */
export type EmptyIllustration =
  | 'box'
  | 'box-zero'
  | 'handshake'
  | 'search'
  | 'ghost'
  | 'success'
  | 'add-user'
  | 'mailbox'
  | 'envelope'
  | 'chat'
  | 'sad-mail'
  | 'chat-zero'
  | 'add-card'
  | 'broken-card'
  | 'wallet'
  | 'people-list'
  | 'doc-list'
  | 'tap-select'
  | 'review-list'
  | 'doc-reject'
  | 'search-results'
  | 'person-mail'
  | 'person-search'
  | 'person-alert'
  | 'person-lock'
  | 'person-quiet'
  | 'person-wait';

const ILLUSTRATION_SRC: Record<EmptyIllustration, string> = {
  box: '/illustrations/empty/box.png',
  'box-zero': '/illustrations/empty/box-zero.png',
  handshake: '/illustrations/empty/handshake.png',
  search: '/illustrations/empty/search.png',
  ghost: '/illustrations/empty/ghost.png',
  success: '/illustrations/empty/success.png',
  'add-user': '/illustrations/empty/add-user.png',
  mailbox: '/illustrations/empty/mailbox.png',
  envelope: '/illustrations/empty/envelope.png',
  chat: '/illustrations/empty/chat.png',
  'sad-mail': '/illustrations/empty/sad-mail.png',
  'chat-zero': '/illustrations/empty/chat-zero.png',
  'add-card': '/illustrations/empty/add-card.png',
  'broken-card': '/illustrations/empty/broken-card.png',
  wallet: '/illustrations/empty/wallet.png',
  'people-list': '/illustrations/empty/people-list.png',
  'doc-list': '/illustrations/empty/doc-list.png',
  'tap-select': '/illustrations/empty/tap-select.png',
  'review-list': '/illustrations/empty/review-list.png',
  'doc-reject': '/illustrations/empty/doc-reject.png',
  'search-results': '/illustrations/empty/search-results.png',
  'person-mail': '/illustrations/empty/person-mail.png',
  'person-search': '/illustrations/empty/person-search.png',
  'person-alert': '/illustrations/empty/person-alert.png',
  'person-lock': '/illustrations/empty/person-lock.png',
  'person-quiet': '/illustrations/empty/person-quiet.png',
  'person-wait': '/illustrations/empty/person-wait.png',
};

/**
 * Empty state pattern (Context → Direction → Action):
 * - title: Context
 * - description: Direction
 * - action: Action (optional)
 * - illustration: real-world metaphor (not selectable / not draggable)
 */
export function EmptyState({
  title,
  description,
  action,
  illustration = 'box',
  illustrationSize = 'md',
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  illustration?: EmptyIllustration | false;
  /** `sm` for below-fold / secondary empties that must not dominate first paint */
  illustrationSize?: 'sm' | 'md';
  className?: string;
}) {
  const preferred = illustration === false ? null : ILLUSTRATION_SRC[illustration];
  const [src, setSrc] = useState<string | null>(preferred);

  useEffect(() => {
    setSrc(preferred);
  }, [preferred]);

  return (
    <div className={cn(illustrationSize === 'sm' ? 'py-6' : 'py-10', 'text-center', className)}>
      {src && (
        <img
          src={src}
          alt=""
          width={illustrationSize === 'sm' ? 112 : 240}
          height={illustrationSize === 'sm' ? 112 : 240}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          onError={() => {
            setSrc((cur) => {
              if (cur && cur !== ILLUSTRATION_SRC.box) return ILLUSTRATION_SRC.box;
              return null;
            });
          }}
          className={cn(
            'mx-auto object-contain pointer-events-none select-none [-webkit-user-drag:none]',
            illustrationSize === 'sm' ? 'mb-3 h-24 w-24 sm:h-28 sm:w-28' : 'mb-5 h-40 w-40 sm:h-52 sm:w-52',
          )}
          decoding="async"
          // Eager: lazy images inside tables / overflow panels often never paint
          loading="eager"
          fetchPriority={illustrationSize === 'md' ? 'high' : 'auto'}
        />
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
