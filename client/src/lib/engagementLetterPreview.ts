const SECTION_HEADERS = new Set([
  'Scope of Services:',
  'Scope and Process:',
  'Professional Fees:',
  'General Terms:',
  'Accepted and Agreed:',
]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSectionHeader(line: string): boolean {
  const t = line.trim();
  return SECTION_HEADERS.has(t) || t.startsWith('Sub:') || t === 'Engagement Letter';
}

function isPartnerBlock(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith('For M.') ||
    t === 'Chartered Accountants' ||
    t.endsWith('Partner')
  );
}

/** Render MKD engagement letter plain text as styled HTML for in-app preview. */
export function formatEngagementLetterHtml(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const parts: string[] = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      parts.push('<p class="mkd-letter-spacer" aria-hidden="true">&nbsp;</p>');
      continue;
    }
    if (trimmed === '---') {
      parts.push('<hr class="mkd-letter-rule" />');
      continue;
    }
    if (trimmed === 'Engagement Letter') {
      parts.push(`<h2 class="mkd-letter-title">${escapeHtml(trimmed)}</h2>`);
      continue;
    }
    if (trimmed.startsWith('Sub:')) {
      parts.push(`<p class="mkd-letter-subject">${escapeHtml(trimmed)}</p>`);
      continue;
    }
    if (isSectionHeader(trimmed)) {
      parts.push(`<p class="mkd-letter-section">${escapeHtml(trimmed)}</p>`);
      continue;
    }
    if (trimmed.startsWith('- ')) {
      parts.push(`<p class="mkd-letter-bullet">${escapeHtml(trimmed)}</p>`);
      continue;
    }
    if (isPartnerBlock(trimmed)) {
      parts.push(`<p class="mkd-letter-partner">${escapeHtml(trimmed)}</p>`);
      continue;
    }
    parts.push(`<p class="mkd-letter-body">${escapeHtml(trimmed)}</p>`);
  }

  return parts.join('\n');
}
