/** Escape string for use in RegExp */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Search terms from user query (min 2 chars, skip stop words optional) */
export function searchTerms(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\w]+|[^\w]+$/g, ''))
    .filter((t) => t.length >= 2);
}

type TextRange = { start: number; end: number };

const termPatternCache = new Map<string, RegExp>();

function termPattern(term: string): RegExp {
  let re = termPatternCache.get(term);
  if (!re) {
    re = new RegExp(escapeRegExp(term), 'gi');
    termPatternCache.set(term, re);
  }
  re.lastIndex = 0;
  return re;
}

function collectTermMatches(text: string, terms: string[]): TextRange[] {
  const matches: TextRange[] = [];
  for (const term of terms) {
    const re = termPattern(term);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return matches;
}

function mergeRanges(ranges: TextRange[]): TextRange[] {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TextRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

function buildHighlightFragment(text: string, terms: string[]): DocumentFragment | null {
  const merged = mergeRanges(collectTermMatches(text, terms));
  if (!merged.length) return null;

  const fragment = document.createDocumentFragment();
  let pos = 0;
  for (const { start, end } of merged) {
    if (start > pos) {
      fragment.appendChild(document.createTextNode(text.slice(pos, start)));
    }
    const mark = document.createElement('mark');
    mark.className = 'doc-search-hit';
    mark.textContent = text.slice(start, end);
    fragment.appendChild(mark);
    pos = end;
  }
  if (pos < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(pos)));
  }
  return fragment;
}

/** Highlight text nodes inside HTML (for mammoth docx output) */
export function highlightHtmlDocument(root: HTMLElement, query: string): number {
  const terms = searchTerms(query);
  if (!terms.length) return 0;

  root.querySelectorAll('mark.doc-search-hit').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(el.textContent || ''), el);
    parent.normalize();
  });

  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n.nodeValue?.trim()) textNodes.push(n as Text);
  }

  for (const node of textNodes) {
    const raw = node.nodeValue || '';
    const fragment = buildHighlightFragment(raw, terms);
    if (fragment) {
      const span = document.createElement('span');
      span.appendChild(fragment);
      count += span.querySelectorAll('mark.doc-search-hit').length;
      node.parentNode?.replaceChild(span, node);
    }
  }
  return count;
}
