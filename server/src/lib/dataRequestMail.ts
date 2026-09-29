import { randomUUID } from 'node:crypto';

/** Prefabricated letter categories that request client data / docs. */
export const DATA_REQUEST_CATEGORIES = new Set([
  'data_request',
  'gstr_monthly_letter',
  'advance_tax_request',
  'tds_monthly_letter',
  'tp_study_request',
  'it_notice_request',
  'notice_communication',
]);

export function isDataRequestCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return DATA_REQUEST_CATEGORIES.has(category.trim().toLowerCase());
}

/** Normalize RFC Message-ID to `<id@domain>` form. */
export function normalizeMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^<|>$/g, '');
  if (!trimmed) return null;
  return `<${trimmed}>`;
}

export function buildStableMessageId(domain = 'auditiq.local'): string {
  const host = domain.replace(/^<|>$/g, '').split('@').pop() || 'auditiq.local';
  return `<${randomUUID()}@${host}>`;
}

export function formatCcList(emails: string[]): string | undefined {
  const cleaned = collectTeamCcEmails(emails);
  return cleaned.length ? cleaned.join(', ') : undefined;
}

export function collectTeamCcEmails(
  teamEmails: string[],
  opts: { exclude?: Array<string | null | undefined> } = {}
): string[] {
  const exclude = new Set(
    (opts.exclude ?? [])
      .flatMap((e) => (e ? e.split(',') : []))
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of teamEmails) {
    const email = raw?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (exclude.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/** Extract message-id tokens from In-Reply-To / References headers. */
export function parseMessageIdList(header: string | null | undefined): string[] {
  if (!header) return [];
  const matches = header.match(/<[^>]+>/g);
  if (matches?.length) return matches.map((m) => normalizeMessageId(m)!).filter(Boolean);
  const single = normalizeMessageId(header);
  return single ? [single] : [];
}

/**
 * Match an inbound reply to a known outbound Message-ID via In-Reply-To then References.
 * ponytail: first hit wins; Gmail always sets In-Reply-To to the parent.
 */
export function matchOutboundMessageId(
  inReplyTo: string | null | undefined,
  references: string | null | undefined,
  knownIds: Iterable<string>
): string | null {
  const known = new Set(
    [...knownIds].map((id) => normalizeMessageId(id)).filter((id): id is string => Boolean(id))
  );
  if (!known.size) return null;
  for (const id of parseMessageIdList(inReplyTo)) {
    if (known.has(id)) return id;
  }
  for (const id of parseMessageIdList(references)) {
    if (known.has(id)) return id;
  }
  return null;
}

/** Domain part for Message-ID from SMTP_FROM / SMTP_USER. */
export function messageIdDomainFromAddress(from: string | undefined): string {
  const match = from?.match(/@([^>\s]+)/);
  return match?.[1] || 'auditiq.local';
}
