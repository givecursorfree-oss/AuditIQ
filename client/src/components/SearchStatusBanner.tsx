import { useAppConfig } from '../hooks/useAppConfig';
import { MagnifyingGlass, Warning, CircleNotch } from '@phosphor-icons/react';

/**
 * Shows search status only when something needs the user's attention.
 * Healthy hybrid search stays silent (Krug: don't make me think).
 */
export default function SearchStatusBanner({ compact = false }: { compact?: boolean }) {
  const { documentSearch, loaded } = useAppConfig();

  if (!loaded || !documentSearch) return null;

  const { mode, typesense, semantic } = documentSearch;
  const shell = compact ? 'px-3 py-2' : 'px-4 py-3';

  // Search is fully working — no banner needed
  if (mode === 'hybrid') return null;

  if (mode === 'keyword' && typesense === 'ok') {
    return (
      <output
        className={`flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm list-none ${shell}`}
      >
        <Warning size={18} className="text-amber-600 shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="font-medium text-foreground">Basic search only</p>
          {!compact && (
            <p className="mt-0.5 text-xs text-foreground-muted">
              You can search by file name and keywords. Meaning-based search is not available yet.
            </p>
          )}
        </div>
      </output>
    );
  }

  if (semantic === 'unavailable' && typesense === 'ok') {
    return (
      <output
        className={`flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm list-none ${shell}`}
      >
        <CircleNotch size={18} className="text-amber-600 shrink-0 mt-0.5 animate-spin" aria-hidden />
        <div>
          <p className="font-medium text-foreground">Search is warming up</p>
          {!compact && (
            <p className="mt-0.5 text-xs text-foreground-muted">
              This can take a minute after startup. File name search works right away.
            </p>
          )}
        </div>
      </output>
    );
  }

  // Limited / offline search stack
  return (
    <output
      className={`flex items-start gap-2 rounded-lg border border-border bg-surface-muted text-sm list-none ${shell}`}
    >
      <MagnifyingGlass size={18} className="text-foreground-muted shrink-0 mt-0.5" aria-hidden />
      <div>
        <p className="font-medium text-foreground">Limited search</p>
        {!compact && (
          <p className="mt-0.5 text-xs text-foreground-muted">
            {import.meta.env.PROD
              ? 'You can still find files by name. Full search will return once indexing is available.'
              : 'Start the local search services, then restart the server for full search.'}
          </p>
        )}
      </div>
    </output>
  );
}
