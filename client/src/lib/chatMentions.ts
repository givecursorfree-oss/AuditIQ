import type { ChatUser } from './chatHelpers';

const CHAT_ROLE_MENTIONS = ['Manager', 'Client', 'Partner', 'Admin', 'Staff', 'Intern'] as const;

export type MentionSuggestion = {
  id: string;
  label: string;
  insertText: string;
  subtitle?: string;
  kind: 'user' | 'role';
};

export type ActiveMention = {
  start: number;
  query: string;
};

function userMatchesMentionQuery(
  nameLower: string,
  emailLower: string,
  roleLower: string,
  query: string
): boolean {
  if (!query) return true;
  if (nameLower.startsWith(query)) return true;
  const haystack = `${nameLower}\0${emailLower}\0${roleLower}`;
  return haystack.indexOf(query) !== -1;
}

/** True when `@` starts a mention (not an email local-part). */
export function getActiveMention(value: string, caret: number): ActiveMention | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  const prev = at > 0 ? before[at - 1] : '';
  if (prev && !/\s/.test(prev)) return null;
  const query = before.slice(at + 1);
  if (query.includes('\n')) return null;
  return { start: at, query };
}

export function buildMentionSuggestions(
  query: string,
  users: ChatUser[],
  options?: { includeRoles?: boolean; limit?: number }
): MentionSuggestion[] {
  const q = query.trim().toLowerCase();
  const limit = options?.limit ?? 8;
  const out: MentionSuggestion[] = [];

  const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name));
  for (const u of sorted) {
    if (out.length >= limit) break;
    const name = u.name.trim();
    if (!name) continue;
    const nameLower = name.toLowerCase();
    const emailLower = u.email.toLowerCase();
    const roleLower = u.role?.toLowerCase() ?? '';
    if (!userMatchesMentionQuery(nameLower, emailLower, roleLower, q)) {
      continue;
    }
    out.push({
      id: u.id,
      label: name,
      insertText: name,
      subtitle: u.role,
      kind: 'user',
    });
  }

  if (options?.includeRoles) {
    for (const role of CHAT_ROLE_MENTIONS) {
      if (out.length >= limit) break;
      const roleLower = role.toLowerCase();
      if (q && !roleLower.startsWith(q)) continue;
      out.push({
        id: `role:${role}`,
        label: role,
        insertText: role,
        subtitle: 'Notify this role',
        kind: 'role',
      });
    }
  }

  return out;
}

export function applyMention(
  value: string,
  start: number,
  caret: number,
  insertText: string
): { value: string; caret: number } {
  const mention = `@${insertText} `;
  const next = value.slice(0, start) + mention + value.slice(caret);
  return { value: next, caret: start + mention.length };
}
