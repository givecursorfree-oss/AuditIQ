import { useEffect, useReducer, useRef } from 'react';
import { CaretLeft, CaretRight, CircleNotch } from '@phosphor-icons/react';
import * as pdfjs from 'pdfjs-dist';
import { searchTerms } from '../lib/highlightText';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

type PdfPage = {
  pageNum: number;
  src: string;
  width: number;
};

type PdfTextItem = {
  str: string;
  transform: number[];
  width?: number;
};

type PreviewState = {
  loading: boolean;
  error: string | null;
  pages: PdfPage[];
  matchCount: number;
  activeMatch: number;
};

type PreviewAction =
  | { type: 'load_start' }
  | { type: 'load_success'; pages: PdfPage[]; matchCount: number }
  | { type: 'load_error'; error: string }
  | { type: 'set_active_match'; activeMatch: number };

const initialPreviewState: PreviewState = {
  loading: true,
  error: null,
  pages: [],
  matchCount: 0,
  activeMatch: 0,
};

function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case 'load_start':
      return { ...initialPreviewState, loading: true };
    case 'load_success':
      return {
        loading: false,
        error: null,
        pages: action.pages,
        matchCount: action.matchCount,
        activeMatch: action.matchCount > 0 ? 1 : 0,
      };
    case 'load_error':
      return {
        ...state,
        loading: false,
        error: action.error,
        pages: [],
        matchCount: 0,
        activeMatch: 0,
      };
    case 'set_active_match':
      return { ...state, activeMatch: action.activeMatch };
    default:
      return state;
  }
}

function drawHighlightRects(
  ctx: CanvasRenderingContext2D,
  viewport: pdfjs.PageViewport,
  items: PdfTextItem[],
  terms: string[]
) {
  if (!terms.length) return 0;
  let count = 0;
  const escapedTerms = terms.map((t) =>
    t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const highlightPattern = escapedTerms.length ? new RegExp(escapedTerms.join('|'), 'i') : null;
  ctx.save();
  ctx.fillStyle = 'rgba(250, 204, 21, 0.45)';
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.9)';
  ctx.lineWidth = 1;

  for (const item of items) {
    if (!item.str.trim()) continue;
    if (!highlightPattern?.test(item.str)) continue;

    const tx = pdfjs.Util.transform(
      viewport.transform,
      item.transform
    ) as number[];
    const fontHeight = Math.hypot(tx[2], tx[3]);
    const width = (item.width ?? 0) * viewport.scale;
    const height = fontHeight || 12;
    const x = tx[4];
    const y = tx[5] - height;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    count += 1;
  }
  ctx.restore();
  return count;
}

async function renderPdfPage(
  pdf: pdfjs.PDFDocumentProxy,
  pageNum: number,
  scrollWidth: number,
  terms: string[]
): Promise<{ page: PdfPage; matches: number } | null> {
  const page = await pdf.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1.5, (scrollWidth - 32) / baseViewport.width);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  await page.render({ canvasContext: ctx, viewport }).promise;

  const textContent = await page.getTextContent();
  const matches = drawHighlightRects(
    ctx,
    viewport,
    textContent.items as PdfTextItem[],
    terms
  );

  return {
    page: {
      pageNum,
      src: canvas.toDataURL('image/jpeg', 0.92),
      width: viewport.width,
    },
    matches,
  };
}

export default function DocumentPdfPreview({
  url,
  searchQuery,
}: {
  url: string;
  searchQuery: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useReducer(previewReducer, initialPreviewState);
  const { loading, error, pages, matchCount, activeMatch } = state;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      dispatch({ type: 'load_start' });

      try {
        const pdf = await pdfjs.getDocument(url).promise;
        if (cancelled) return;

        const terms = searchTerms(searchQuery);
        const scrollWidth = scrollRef.current?.clientWidth || 800;
        const pageNums = Array.from({ length: pdf.numPages }, (_, i) => i + 1);

        const results = await Promise.all(
          pageNums.map((pageNum) => renderPdfPage(pdf, pageNum, scrollWidth, terms))
        );

        if (cancelled) return;

        const rendered = results
          .filter((r): r is NonNullable<typeof r> => r != null)
          .sort((a, b) => a.page.pageNum - b.page.pageNum);

        const totalMatches = rendered.reduce((sum, r) => sum + r.matches, 0);

        dispatch({
          type: 'load_success',
          pages: rendered.map((r) => r.page),
          matchCount: totalMatches,
        });
      } catch (e) {
        if (!cancelled) {
          dispatch({
            type: 'load_error',
            error: (e as Error).message || 'Failed to render PDF',
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [url, searchQuery]);

  const scrollToMatch = (direction: 1 | -1) => {
    if (!matchCount || !pages.length) return;
    const next =
      direction === 1
        ? activeMatch >= matchCount
          ? 1
          : activeMatch + 1
        : activeMatch <= 1
          ? matchCount
          : activeMatch - 1;
    dispatch({ type: 'set_active_match', activeMatch: next });
    const idx = Math.min(
      pages.length - 1,
      Math.floor((next - 1) / Math.max(1, Math.ceil(matchCount / pages.length)))
    );
    const el = scrollRef.current?.querySelector(`[data-page="${pages[idx]?.pageNum}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="flex flex-col h-full">
      {searchQuery.trim() && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface text-xs shrink-0">
          <span className="text-foreground-muted">
            Highlights for <strong className="text-foreground">&quot;{searchQuery}&quot;</strong>
            {matchCount > 0
              ? ` · ${matchCount} match${matchCount === 1 ? '' : 'es'} on page text`
              : ' · no text matches on visible layers'}
          </span>
          {matchCount > 0 && (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollToMatch(-1)}
                className="p-1 rounded hover:bg-hover-bg"
                aria-label="Previous match"
              >
                <CaretLeft size={14} />
              </button>
              <span className="tabular-nums text-foreground-muted">
                {activeMatch}/{matchCount}
              </span>
              <button
                type="button"
                onClick={() => scrollToMatch(1)}
                className="p-1 rounded hover:bg-hover-bg"
                aria-label="Next match"
              >
                <CaretRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 bg-zinc-100 dark:bg-zinc-900/50"
      >
        {loading && (
          <div className="flex items-center justify-center h-40 gap-2 text-foreground-muted">
            <CircleNotch size={20} className="animate-spin" aria-hidden />
            <span>Loading document…</span>
          </div>
        )}
        {error && !loading && (
          <p className="text-center text-sm text-danger py-8" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && (
          <div className="space-y-4">
            {pages.map((page) => (
              <div
                key={page.pageNum}
                data-page={page.pageNum}
                className="relative mx-auto shadow-md bg-white"
                style={{ maxWidth: page.width }}
              >
                <img
                  src={page.src}
                  alt={`Page ${page.pageNum}`}
                  className="block w-full h-auto"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
