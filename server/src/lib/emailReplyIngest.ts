import prisma from './prisma.js';
import {
  matchOutboundMessageId,
  normalizeMessageId,
  parseMessageIdList,
} from './dataRequestMail.js';

export type InboundReplyPayload = {
  messageId: string;
  inReplyTo?: string | null;
  references?: string | null;
  subject: string;
  fromAddress: string;
  toAddress: string;
  ccAddress?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  imapUid?: string | null;
};

export type IngestResult = {
  stored: boolean;
  duplicate?: boolean;
  unmatched?: boolean;
  engagementId?: string | null;
  clientId?: string | null;
  teamUserIds?: string[];
  threadRootId?: string | null;
  id?: string;
};

function parseTeamUserIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Map a client reply onto the outbound data-request thread and store it for the
 * engagement team that was CC'd on the original send.
 */
export async function ingestInboundReply(payload: InboundReplyPayload): Promise<IngestResult> {
  const messageId = normalizeMessageId(payload.messageId);
  if (!messageId) {
    return { stored: false, unmatched: true };
  }

  const existing = await prisma.emailThreadMessage.findUnique({ where: { messageId } });
  if (existing) {
    return {
      stored: false,
      duplicate: true,
      engagementId: existing.engagementId,
      clientId: existing.clientId,
      teamUserIds: parseTeamUserIds(existing.teamUserIds),
      threadRootId: existing.threadRootId,
      id: existing.id,
    };
  }

  if (payload.imapUid) {
    const byUid = await prisma.emailThreadMessage.findFirst({ where: { imapUid: payload.imapUid } });
    if (byUid) {
      return {
        stored: false,
        duplicate: true,
        engagementId: byUid.engagementId,
        clientId: byUid.clientId,
        teamUserIds: parseTeamUserIds(byUid.teamUserIds),
        threadRootId: byUid.threadRootId,
        id: byUid.id,
      };
    }
  }

  const candidates = [
    ...parseMessageIdList(payload.inReplyTo),
    ...parseMessageIdList(payload.references),
  ];
  if (!candidates.length) {
    return { stored: false, unmatched: true };
  }

  const outbound = await prisma.emailThreadMessage.findMany({
    where: { direction: 'outbound', messageId: { in: candidates } },
  });
  const knownIds = outbound.map((o) => o.messageId);
  // Also accept any id present in References that we stored as threadRootId
  const byRoot = await prisma.emailThreadMessage.findMany({
    where: { direction: 'outbound', threadRootId: { in: candidates } },
    take: 50,
  });
  for (const row of byRoot) knownIds.push(row.messageId);

  const matchedId = matchOutboundMessageId(payload.inReplyTo, payload.references, knownIds);
  if (!matchedId) {
    return { stored: false, unmatched: true };
  }

  const root =
    outbound.find((o) => o.messageId === matchedId) ||
    byRoot.find((o) => o.messageId === matchedId) ||
    (await prisma.emailThreadMessage.findUnique({ where: { messageId: matchedId } }));

  if (!root || root.direction !== 'outbound') {
    return { stored: false, unmatched: true };
  }

  const teamUserIds = parseTeamUserIds(root.teamUserIds);
  const created = await prisma.emailThreadMessage.create({
    data: {
      messageId,
      inReplyTo: normalizeMessageId(payload.inReplyTo) ?? undefined,
      referencesHdr: payload.references ?? undefined,
      direction: 'inbound',
      threadRootId: root.threadRootId || root.messageId,
      subject: payload.subject,
      fromAddress: payload.fromAddress,
      toAddress: payload.toAddress,
      ccAddress: payload.ccAddress ?? undefined,
      bodyText: payload.bodyText ?? undefined,
      bodyHtml: payload.bodyHtml ?? undefined,
      clientId: root.clientId ?? undefined,
      engagementId: root.engagementId ?? undefined,
      teamUserIds: teamUserIds.length ? JSON.stringify(teamUserIds) : root.teamUserIds,
      imapUid: payload.imapUid ?? undefined,
    },
  });

  return {
    stored: true,
    engagementId: created.engagementId,
    clientId: created.clientId,
    teamUserIds,
    threadRootId: created.threadRootId,
    id: created.id,
  };
}
