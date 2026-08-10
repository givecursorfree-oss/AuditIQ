import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';

import { At, UsersThree } from '@phosphor-icons/react';

import type { ChatUser } from '@/lib/chatHelpers';

import { formatRoleLabel } from '@/lib/roleLabels';

import UserPresenceAvatar from '@/components/UserPresenceAvatar';

import { normalizePresenceStatus } from '@/lib/presence';

import {

  applyMention,

  buildMentionSuggestions,

  getActiveMention,

  type MentionSuggestion,

} from '@/lib/chatMentions';

import { cn } from '@/lib/utils';



type ChatMentionComposerProps = {

  value: string;

  onChange: (value: string) => void;

  onSubmit: () => void;

  onTyping?: (typing: boolean) => void;

  placeholder?: string;

  disabled?: boolean;

  mentionUsers: ChatUser[];

  includeRoleMentions?: boolean;

  className?: string;

};



type MentionNavHandle = {

  highlight: number;

  dismissed: boolean;

  setDismissed: (dismissed: boolean) => void;

  setHighlight: (index: number | ((prev: number) => number)) => void;

  pick: (item: MentionSuggestion) => void;

};



function findUser(users: ChatUser[], id: string) {

  return users.find((u) => u.id === id);

}



const MentionNavSession = forwardRef<

  MentionNavHandle,

  {

    active: NonNullable<ReturnType<typeof getActiveMention>>;

    value: string;

    caret: number;

    onChange: (value: string) => void;

    mentionUsers: ChatUser[];

    includeRoleMentions: boolean;

    textareaRef: React.RefObject<HTMLTextAreaElement | null>;

  }

>(function MentionNavSession(

  { active, value, caret, onChange, mentionUsers, includeRoleMentions, textareaRef },

  ref

) {

  const listRef = useRef<HTMLUListElement>(null);

  const [highlight, setHighlight] = useState(0);

  const [dismissed, setDismissed] = useState(false);



  const suggestions = useMemo(() => {

    if (dismissed) return [];

    return buildMentionSuggestions(active.query, mentionUsers, {

      includeRoles: includeRoleMentions,

      limit: 8,

    });

  }, [active.query, dismissed, mentionUsers, includeRoleMentions]);



  const roleSuggestions = suggestions.filter((s) => s.kind === 'role');

  const userSuggestions = suggestions.filter((s) => s.kind === 'user');

  const flatSuggestions = useMemo(

    () => [...userSuggestions, ...roleSuggestions],

    [userSuggestions, roleSuggestions]

  );



  const pick = useCallback(

    (item: MentionSuggestion) => {

      const { value: next, caret: nextCaret } = applyMention(value, active.start, caret, item.insertText);

      onChange(next);

      setDismissed(true);

      requestAnimationFrame(() => {

        const el = textareaRef.current;

        if (!el) return;

        el.focus();

        el.setSelectionRange(nextCaret, nextCaret);

      });

    },

    [active.start, caret, onChange, textareaRef, value]

  );



  useImperativeHandle(

    ref,

    () => ({

      highlight,

      dismissed,

      setDismissed,

      setHighlight,

      pick,

    }),

    [highlight, dismissed, pick]

  );



  useEffect(() => {

    if (suggestions.length === 0) return;

    const el = listRef.current?.querySelector('[data-highlight="true"]');

    el?.scrollIntoView({ block: 'nearest' });

  }, [highlight, suggestions.length]);



  const renderSuggestion = (item: MentionSuggestion, idx: number) => {

    const user = item.kind === 'user' ? findUser(mentionUsers, item.id) : undefined;

    return (

      <li key={item.id} role="option" aria-selected={idx === highlight}>

        <button

          type="button"

          data-highlight={idx === highlight ? 'true' : undefined}

          className={cn(

            'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',

            idx === highlight ? 'bg-muted text-foreground' : 'text-foreground hover:bg-hover-bg'

          )}

          onMouseDown={(e) => {

            e.preventDefault();

            pick(item);

          }}

          onMouseEnter={() => setHighlight(idx)}

        >

          {item.kind === 'role' ? (

            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">

              <At size={16} weight="bold" />

            </span>

          ) : user ? (

            <UserPresenceAvatar

              userId={user.id}

              initials={user.initials}

              presenceStatus={normalizePresenceStatus(user.presenceStatus)}

              size="sm"

            />

          ) : (

            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground-secondary">

              {item.label.slice(0, 2).toUpperCase()}

            </span>

          )}

          <span className="min-w-0 flex-1">

            <span className="font-medium block truncate">{item.label}</span>

            {item.subtitle && (

              <span className="text-[10px] text-foreground-muted block truncate">

                {item.kind === 'role' ? item.subtitle : formatRoleLabel(item.subtitle)}

              </span>

            )}

          </span>

        </button>

      </li>

    );

  };



  let optionIndex = 0;

  const panelOpen = !dismissed;



  if (!panelOpen) return null;



  if (flatSuggestions.length === 0) {

    return (

      <p className="absolute bottom-full left-0 right-0 mb-1 z-20 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-foreground-muted shadow-md">

        No matching people or roles.

      </p>

    );

  }



  return (

    <ul

      ref={listRef}

      role="listbox"

      aria-label="Mention suggestions"

      className="absolute bottom-full left-0 right-0 mb-1 z-20 max-h-52 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-md"

    >

      {userSuggestions.length > 0 && (

        <>

          <li className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted flex items-center gap-1">

            <UsersThree size={12} />

            People

          </li>

          {userSuggestions.map((item) => renderSuggestion(item, optionIndex++))}

        </>

      )}

      {roleSuggestions.length > 0 && (

        <>

          <li className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted flex items-center gap-1">

            <At size={12} />

            Roles

          </li>

          {roleSuggestions.map((item) => renderSuggestion(item, optionIndex++))}

        </>

      )}

    </ul>

  );

});



export default function ChatMentionComposer({

  value,

  onChange,

  onSubmit,

  onTyping,

  placeholder,

  disabled,

  mentionUsers,

  includeRoleMentions = false,

  className,

}: ChatMentionComposerProps) {

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionNavRef = useRef<MentionNavHandle>(null);

  const [caret, setCaret] = useState(0);



  const active = useMemo(() => getActiveMention(value, caret), [value, caret]);

  const mentionKey = active ? `${active.start}:${active.query}` : null;

  const panelOpen = Boolean(active && !mentionNavRef.current?.dismissed);



  const syncCaret = useCallback(() => {

    const el = textareaRef.current;

    if (el) setCaret(el.selectionStart ?? value.length);

  }, [value.length]);



  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {

    const nav = mentionNavRef.current;

    const flatCount =

      active && nav && !nav.dismissed

        ? buildMentionSuggestions(active.query, mentionUsers, {

            includeRoles: includeRoleMentions,

            limit: 8,

          }).length

        : 0;



    if (active && nav && !nav.dismissed && flatCount > 0) {

      if (e.key === 'ArrowDown') {

        e.preventDefault();

        nav.setHighlight((i) => (i + 1) % flatCount);

        return;

      }

      if (e.key === 'ArrowUp') {

        e.preventDefault();

        nav.setHighlight((i) => (i - 1 + flatCount) % flatCount);

        return;

      }

      if (e.key === 'Enter' || e.key === 'Tab') {

        e.preventDefault();

        const suggestions = buildMentionSuggestions(active.query, mentionUsers, {

          includeRoles: includeRoleMentions,

          limit: 8,

        });

        const item = suggestions[nav.highlight];

        if (item) nav.pick(item);

        return;

      }

      if (e.key === 'Escape') {

        e.preventDefault();

        nav.setDismissed(true);

        return;

      }

    }

    if (e.key === 'Enter' && !e.shiftKey) {

      e.preventDefault();

      onSubmit();

    }

  };



  return (

    <div className="relative flex-1 min-w-0">

      {active && (

        <MentionNavSession

          key={mentionKey}

          ref={mentionNavRef}

          active={active}

          value={value}

          caret={caret}

          onChange={onChange}

          mentionUsers={mentionUsers}

          includeRoleMentions={includeRoleMentions}

          textareaRef={textareaRef}

        />

      )}

      <textarea

        ref={textareaRef}

        value={value}

        disabled={disabled}

        onChange={(e) => {

          onChange(e.target.value);

          setCaret(e.target.selectionStart ?? e.target.value.length);

          if (e.target.value.trim()) onTyping?.(true);

        }}

        onSelect={syncCaret}

        onClick={syncCaret}

        onKeyUp={syncCaret}

        onBlur={() => {

          onTyping?.(false);

          window.setTimeout(() => mentionNavRef.current?.setDismissed(true), 150);

        }}

        onFocus={() => mentionNavRef.current?.setDismissed(false)}

        onKeyDown={handleKeyDown}

        placeholder={placeholder}

        aria-label={placeholder ?? 'Message'}

        rows={1}

        aria-autocomplete="list"

        aria-expanded={panelOpen}

        className={cn(

          'input-field w-full text-sm resize-none min-h-[40px] max-h-[120px] bg-muted border border-border text-foreground placeholder:text-foreground-muted',

          className

        )}

      />

    </div>

  );

}

