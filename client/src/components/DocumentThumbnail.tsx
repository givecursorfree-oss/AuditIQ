import { useEffect, useRef, useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import {
  canShowThumbnail,
  getCachedThumbnail,
  loadDocumentThumbnail,
} from '../lib/documentThumbnail';

type Props = {
  documentId: string;
  fileName: string;
  /** Fallback icon area background class */
  bgClass: string;
  /** Fallback icon */
  fallback: React.ReactNode;
  className?: string;
  alt?: string;
};

export default function DocumentThumbnail({
  documentId,
  fileName,
  bgClass,
  fallback,
  className = 'h-28',
  alt,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(() => getCachedThumbnail(documentId) ?? null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (src || failed || !canShowThumbnail(fileName)) return;

    const el = rootRef.current;
    if (!el) return;

    let cancelled = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || cancelled) return;
        observer.disconnect();
        setLoading(true);
        loadDocumentThumbnail(documentId, fileName)
          .then((url) => {
            if (cancelled) return;
            if (url) setSrc(url);
            else setFailed(true);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      { rootMargin: '80px' }
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [documentId, fileName, src, failed]);

  const showPreview = Boolean(src) && !failed;

  return (
    <div
      ref={rootRef}
      className={`relative overflow-hidden flex items-center justify-center ${bgClass} ${className}`}
    >
      {showPreview ? (
        <img
          src={src!}
          alt={alt || `Preview of ${fileName}`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-top bg-white dark:bg-zinc-900"
        />
      ) : (
        fallback
      )}
      {loading && !showPreview && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/5 dark:bg-white/5"
          aria-hidden
        >
          <CircleNotch size={22} className="text-foreground-muted animate-spin" />
        </div>
      )}
      {/* subtle bottom fade into card body */}
      {showPreview && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card/80 to-transparent"
          aria-hidden
        />
      )}
    </div>
  );
}
