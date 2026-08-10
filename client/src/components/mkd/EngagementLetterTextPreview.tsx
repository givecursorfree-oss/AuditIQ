import { formatEngagementLetterHtml } from '@/lib/engagementLetterPreview';
import { sanitizeLetterPreviewHtml } from '@/lib/sanitizeHtml';

export function EngagementLetterTextPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <p className="text-sm text-foreground-muted py-8 text-center">
        No letter content to preview yet.
      </p>
    );
  }

  const html = sanitizeLetterPreviewHtml(formatEngagementLetterHtml(content));

  return (
    <div className="mkd-letter-preview-root h-[420px] overflow-y-auto rounded-lg border border-border bg-white text-[#111]">
      <div
        className="px-8 py-6 text-[13px] leading-relaxed max-w-none
          [&_.mkd-letter-title]:text-center [&_.mkd-letter-title]:text-lg [&_.mkd-letter-title]:font-bold [&_.mkd-letter-title]:mb-5
          [&_.mkd-letter-subject]:font-semibold [&_.mkd-letter-subject]:mb-4
          [&_.mkd-letter-section]:font-semibold [&_.mkd-letter-section]:mt-3 [&_.mkd-letter-section]:mb-1
          [&_.mkd-letter-partner]:font-semibold
          [&_.mkd-letter-bullet]:ml-4 [&_.mkd-letter-bullet]:mb-1
          [&_.mkd-letter-body]:mb-1 [&_.mkd-letter-body]:text-justify
          [&_.mkd-letter-spacer]:h-2 [&_.mkd-letter-spacer]:mb-0
          [&_.mkd-letter-rule]:my-4 [&_.mkd-letter-rule]:border-border"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
