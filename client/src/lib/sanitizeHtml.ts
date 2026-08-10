import DOMPurify from 'dompurify';

/** Mammoth DOCX HTML — allow structure + search highlight marks only. */
export function sanitizeDocxHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'strong',
      'em',
      'b',
      'i',
      'u',
      'span',
      'br',
      'mark',
      'a',
      'img',
      'colgroup',
      'col',
    ],
    ALLOWED_ATTR: ['class', 'href', 'src', 'alt', 'colspan', 'rowspan', 'style'],
  });
}

/** Engagement letter preview — only tags emitted by formatEngagementLetterHtml. */
export function sanitizeLetterPreviewHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'h2', 'hr'],
    ALLOWED_ATTR: ['class', 'aria-hidden'],
  });
}
