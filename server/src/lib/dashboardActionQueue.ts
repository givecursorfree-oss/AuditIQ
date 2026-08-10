import prisma from './prisma.js';
import { serviceLabel } from './clientRequestHelpers.js';
import { teamAssignmentPath } from './teamAssignmentRoutes.js';

export type ActionQueueKind = 'new_request' | 'letter_signed' | 'awaiting_signature';

export type ActionQueueItem = {
  id: string;
  kind: ActionQueueKind;
  priority: number;
  title: string;
  subtitle: string;
  clientName: string;
  submittedAt: string | null;
  serviceLabels: string[];
  href: string;
  actionLabel: string;
};

export type DashboardActionQueue = {
  items: ActionQueueItem[];
  summary: {
    total: number;
    actionable: number;
    newRequests: number;
    letterSigned: number;
    awaitingSignature: number;
  };
};

const KIND_PRIORITY: Record<ActionQueueKind, number> = {
  new_request: 1,
  letter_signed: 2,
  awaiting_signature: 3,
};

export async function buildDashboardActionQueue(firmId: string): Promise<DashboardActionQueue> {
  const [newRequests, signedNeedsTeam, awaitingSignature] = await Promise.all([
    prisma.clientRequest.findMany({
      where: { firmId, status: 'pending' },
      include: {
        client: { select: { name: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 8,
    }),
    prisma.engagement.findMany({
      where: {
        firmId,
        letterStatus: 'signed',
        partnerInChargeId: null,
        managerId: null,
        articleAssistantId: null,
        status: { notIn: ['Closed', 'Archived'] },
      },
      select: {
        id: true,
        title: true,
        elSignedAt: true,
        client: { select: { name: true } },
      },
      orderBy: { elSignedAt: 'desc' },
      take: 8,
    }),
    prisma.engagement.findMany({
      where: {
        firmId,
        letterStatus: 'sent',
        status: { notIn: ['Closed', 'Archived'] },
      },
      select: {
        id: true,
        title: true,
        client: { select: { name: true } },
        engagementLetter: { select: { sentAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),
  ]);

  const items: ActionQueueItem[] = [
    ...newRequests.map((row) => {
      const services = row.selectedServices as string[];
      const labels = services.map(serviceLabel);
      return {
        id: `req-${row.id}`,
        kind: 'new_request' as const,
        priority: KIND_PRIORITY.new_request,
        title: 'New client request',
        subtitle: labels.length ? labels.join(' · ') : 'Service request',
        clientName: row.client.name,
        submittedAt: row.submittedAt.toISOString(),
        serviceLabels: labels,
        href: `/requests/${row.id}`,
        actionLabel: 'Review & approve',
      };
    }),
    ...signedNeedsTeam.map((eng) => ({
      id: `signed-${eng.id}`,
      kind: 'letter_signed' as const,
      priority: KIND_PRIORITY.letter_signed,
      title: 'Letter signed — assign team',
      subtitle: eng.title,
      clientName: eng.client.name,
      submittedAt: eng.elSignedAt?.toISOString() ?? null,
      serviceLabels: [] as string[],
      href: teamAssignmentPath(eng.id),
      actionLabel: 'Assign team',
    })),
    ...awaitingSignature.map((eng) => ({
      id: `await-${eng.id}`,
      kind: 'awaiting_signature' as const,
      priority: KIND_PRIORITY.awaiting_signature,
      title: 'Awaiting client signature',
      subtitle: eng.title,
      clientName: eng.client.name,
      submittedAt: eng.engagementLetter?.sentAt?.toISOString() ?? null,
      serviceLabels: [] as string[],
      href: `/engagements/${eng.id}/letter`,
      actionLabel: 'View letter',
    })),
  ];

  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return bTime - aTime;
  });

  return {
    items: items.slice(0, 8),
    summary: {
      total: items.length,
      actionable: newRequests.length + signedNeedsTeam.length,
      newRequests: newRequests.length,
      letterSigned: signedNeedsTeam.length,
      awaitingSignature: awaitingSignature.length,
    },
  };
}
