import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CaretDown, MagnifyingGlass } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { searchableMatch } from '@/lib/searchableMatch';

export type SearchableOption = {
  value: string;
  label: string;
};

type Props = {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shown as the first empty choice (value ""). Omit to disallow clearing. */
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  'aria-label'?: string;
  id?: string;
};

/** Type-to-filter single select — same footprint as `input-field` native selects. */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  emptyLabel,
  disabled,
  required,
  className,
  'aria-label': ariaLabel,
  id: idProp,
}: Props) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const selectedLabel = useMemo(() => {
    if (value === '' && emptyLabel) return emptyLabel;
    return options.find((o) => o.value === value)?.label ?? '';
  }, [options, value, emptyLabel]);

  const filtered = useMemo(() => {
    const base =
      emptyLabel != null
        ? [{ value: '', label: emptyLabel }, ...options]
        : options;
    const q = query.trim();
    if (!q) return base;
    return base.filter(
      (o) => searchableMatch(o.label, q) || (o.value !== '' && searchableMatch(o.value, q))
    );
  }, [options, query, emptyLabel]);

  useEffect(() => {
    if (!open) return;
    setHighlight(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[highlight];
      if (item) pick(item.value);
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-required={required || undefined}
        className={cn(
          'input-field flex w-full items-center justify-between gap-2 text-left',
          disabled && 'opacity-60 cursor-not-allowed'
        )}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
      >
        <span className={cn('truncate', !selectedLabel && 'text-muted-foreground')}>
          {selectedLabel || placeholder}
        </span>
        <CaretDown size={14} className="shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg"
          role="presentation"
        >
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <MagnifyingGlass size={14} className="shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder={placeholder}
              value={query}
              aria-label={ariaLabel ? `Search ${ariaLabel}` : 'Search options'}
              aria-autocomplete="list"
              aria-controls={listId}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            className="max-h-56 overflow-y-auto py-1 text-sm"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-muted-foreground">No matches</li>
            ) : (
              filtered.map((opt, i) => {
                const selected = opt.value === value;
                const active = i === highlight;
                return (
                  <li key={`${opt.value}::${opt.label}`} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full px-3 py-1.5 text-left hover:bg-muted/60',
                        active && 'bg-muted/60',
                        selected && 'font-medium'
                      )}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(opt.value)}
                    >
                      <span className="truncate">{opt.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
