import { useEffect, useMemo } from 'react';
import { highlightHtmlDocument } from '../lib/highlightText';
import { sanitizeDocxHtml } from '../lib/sanitizeHtml';

export default function DocumentDocxPreview({
  html,
  searchQuery,
}: {
  html: string;
  searchQuery: string;
}) {
  const { highlightedHtml, matchCount } = useMemo(() => {
    const host = document.createElement('div');
    const safeHtml = sanitizeDocxHtml(html);
    host.innerHTML = safeHtml;
    const count = highlightHtmlDocument(host, searchQuery);
    return {
      highlightedHtml: sanitizeDocxHtml(host.innerHTML),
      matchCount: count,
    };
  }, [html, searchQuery]);

  useEffect(() => {
    const first = document.querySelector('.docx-preview-root mark.doc-search-hit');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedHtml, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {searchQuery.trim() && (
        <div className="px-3 py-2 border-b border-border bg-surface text-xs shrink-0 text-foreground-muted">
          Highlights for <strong className="text-foreground">&quot;{searchQuery}&quot;</strong>
          {matchCount > 0
            ? ` · ${matchCount} match${matchCount === 1 ? '' : 'es'} in document`
            : ' · no matches in converted text'}
        </div>
      )}
      <div
        className="docx-preview-root flex-1 overflow-y-auto p-8 bg-white text-black prose max-w-none [&_mark.doc-search-hit]:bg-amber-300 [&_mark.doc-search-hit]:text-black [&_mark.doc-search-hit]:rounded-sm [&_mark.doc-search-hit]:px-0.5"
        dangerouslySetInnerHTML={{ __html: sanitizeDocxHtml(highlightedHtml) }}
      />
    </div>
  );
}
