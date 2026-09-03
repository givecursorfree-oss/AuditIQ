import { useCallback, useEffect, useState } from 'react';
import { CaretLeft, CaretRight, X, MagnifyingGlassPlus, MagnifyingGlassMinus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { modalBackdropProps } from '@/lib/interactiveProps';

type Slide = { id: string; url: string; name: string; mimeType?: string | null };

export function ClaimReceiptLightbox({
  slides,
  index,
  onClose,
  onIndexChange,
}: {
  slides: Slide[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const slide = slides[index];
  const isPdf = slide?.mimeType === 'application/pdf' || slide?.name.toLowerCase().endsWith('.pdf');

  const prev = useCallback(() => onIndexChange((index - 1 + slides.length) % slides.length), [index, onIndexChange, slides.length]);
  const next = useCallback(() => onIndexChange((index + 1) % slides.length), [index, onIndexChange, slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (slides.length < 2) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next, slides.length]);

  useEffect(() => {
    setZoom(1);
  }, [index]);

  useEffect(() => {
    return () => {
      slides.forEach((s) => URL.revokeObjectURL(s.url));
    };
    // ponytail: revoke lightbox blobs on unmount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!slide) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" {...modalBackdropProps(onClose, 'Close')}>
      <div className="relative w-full max-w-4xl mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-white mb-2">
          <span className="text-sm">{index + 1}/{slides.length}</span>
          <div className="flex gap-1">
            {!isPdf && (
              <>
                <Button type="button" size="sm" variant="ghost" className="text-white" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
                  <MagnifyingGlassPlus size={18} />
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-white" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
                  <MagnifyingGlassMinus size={18} />
                </Button>
              </>
            )}
            <Button type="button" size="sm" variant="ghost" className="text-white" onClick={onClose}>
              <X size={18} />
            </Button>
          </div>
        </div>
        <div className="relative flex items-center justify-center min-h-[50vh] bg-black/40 rounded-lg overflow-hidden">
          {slides.length > 1 && (
            <Button type="button" size="sm" variant="ghost" className="absolute left-2 text-white z-10" onClick={prev}>
              <CaretLeft size={24} />
            </Button>
          )}
          {isPdf ? (
            <iframe title={slide.name} src={slide.url} className="h-[70vh] w-full bg-white" />
          ) : (
            <img
              src={slide.url}
              alt={slide.name}
              className="max-h-[70vh] object-contain transition-transform"
              style={{ transform: `scale(${zoom})` }}
            />
          )}
          {slides.length > 1 && (
            <Button type="button" size="sm" variant="ghost" className="absolute right-2 text-white z-10" onClick={next}>
              <CaretRight size={24} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
