import { useAppConfig } from '../hooks/useAppConfig';

import { MagnifyingGlass, Warning, CheckCircle, CircleNotch } from '@phosphor-icons/react';



/**

 * Status banner for the File Brain–style search stack (Tika + Typesense).

 */

export default function SearchStatusBanner({ compact = false }: { compact?: boolean }) {

  const { documentSearch, loaded } = useAppConfig();



  if (!loaded || !documentSearch) return null;



  const { mode, typesense, tika, semantic, embeddingModel } = documentSearch;

  const shell = compact ? 'px-3 py-2' : 'px-4 py-3';



  if (mode === 'hybrid') {

    return (

      <output

        className={`flex items-start gap-2 rounded-lg border border-border bg-surface-muted text-sm text-foreground-secondary list-none ${shell}`}

      >

        <CheckCircle size={18} className="text-success shrink-0 mt-0.5" weight="fill" aria-hidden />

        <div>

          <p className="font-medium text-foreground">Semantic search active</p>

          {!compact && (

            <p className="mt-0.5 text-xs text-foreground-muted">

              Hybrid keyword + meaning search via {embeddingModel}. Filename matches appear immediately;

              the first semantic query may take a few seconds while the model loads.

            </p>

          )}

        </div>

      </output>

    );

  }



  if (mode === 'keyword' && typesense === 'ok') {

    return (

      <output

        className={`flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm list-none ${shell}`}

      >

        <Warning size={18} className="text-amber-600 shrink-0 mt-0.5" aria-hidden />

        <div>

          <p className="font-medium text-foreground">Keyword search only</p>

          {!compact && (

            <p className="mt-0.5 text-xs text-foreground-muted">

              Enable semantic search in server config (SEMANTIC_SEARCH_ENABLED=true) and re-index.

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

          <p className="font-medium text-foreground">Embedding model loading</p>

          {!compact && (

            <p className="mt-0.5 text-xs text-foreground-muted">

              First startup can take 1–3 minutes. Use Reindex when ready (Partner/Admin).

            </p>

          )}

        </div>

      </output>

    );

  }



  return (

    <output

      className={`flex items-start gap-2 rounded-lg border border-border bg-surface-muted text-sm list-none ${shell}`}

    >

      <MagnifyingGlass size={18} className="text-foreground-muted shrink-0 mt-0.5" aria-hidden />

      <div>

        <p className="font-medium text-foreground">Limited search mode</p>

        {!compact && (

          <p className="mt-0.5 text-xs text-foreground-muted">

            Typesense {typesense === 'ok' ? 'ok' : 'offline'}, Tika {tika === 'ok' ? 'ok' : 'offline'}.

            Run <code className="text-[0.7rem] bg-hover-bg px-1 rounded">npm run search:up</code> and restart

            the server for full semantic search.

          </p>

        )}

      </div>

    </output>

  );

}

