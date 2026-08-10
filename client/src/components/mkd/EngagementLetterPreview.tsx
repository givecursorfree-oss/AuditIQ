import { useEffect, useState } from 'react';
import mammoth from 'mammoth';
import api from '@/services/api';
import DocumentDocxPreview from '@/components/DocumentDocxPreview';
import { EngagementLetterTextPreview } from '@/components/mkd/EngagementLetterTextPreview';

type PreviewMode = 'letter' | 'word';

function WordDocxPreview({
  docxUrl,
  cacheKey,
  content,
}: {
  docxUrl: string;
  cacheKey?: string | number;
  content: string;
}) {
  const [wordHtml, setWordHtml] = useState('');
  const [wordLoading, setWordLoading] = useState(true);
  const [wordError, setWordError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const path = cacheKey != null ? `${docxUrl}?t=${cacheKey}` : docxUrl;
        const res = await api.get(path, { responseType: 'arraybuffer' });
        const result = await mammoth.convertToHtml({ arrayBuffer: res.data as ArrayBuffer });
        if (!cancelled) setWordHtml(result.value);
      } catch {
        if (!cancelled) {
          setWordError(
            'Word file preview is unavailable. Use the Letter preview tab or download the .docx file.'
          );
        }
      } finally {
        if (!cancelled) setWordLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docxUrl, cacheKey]);

  if (wordLoading) {
    return <p className="text-sm text-foreground-muted py-8 text-center">Loading Word preview…</p>;
  }
  if (wordError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground-muted">{wordError}</p>
        <EngagementLetterTextPreview content={content} />
      </div>
    );
  }
  return (
    <div className="h-[420px] rounded-lg border border-border overflow-hidden bg-white">
      <DocumentDocxPreview html={wordHtml} searchQuery="" />
    </div>
  );
}

export function EngagementLetterPreview({
  content,
  docxUrl,
  cacheKey,
}: {
  content: string;
  docxUrl?: string | null;
  cacheKey?: string | number;
}) {
  const [mode, setMode] = useState<PreviewMode>('letter');

  const showWordTab = !!docxUrl;
  const wordPreviewKey = `${docxUrl ?? ''}:${cacheKey ?? ''}`;

  return (
    <div className="space-y-2">
      {showWordTab && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`text-xs px-3 py-1.5 rounded-md border ${
              mode === 'letter' ? 'border-primary bg-primary/10 text-primary' : 'border-border'
            }`}
            onClick={() => setMode('letter')}
          >
            Letter preview
          </button>
          <button
            type="button"
            className={`text-xs px-3 py-1.5 rounded-md border ${
              mode === 'word' ? 'border-primary bg-primary/10 text-primary' : 'border-border'
            }`}
            onClick={() => setMode('word')}
          >
            Word file
          </button>
          <a
            href={cacheKey != null ? `${docxUrl}?t=${cacheKey}` : docxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline ml-auto"
          >
            Download .docx
          </a>
        </div>
      )}

      {mode === 'letter' || !showWordTab ? (
        <EngagementLetterTextPreview content={content} />
      ) : (
        <WordDocxPreview key={wordPreviewKey} docxUrl={docxUrl} cacheKey={cacheKey} content={content} />
      )}
    </div>
  );
}
