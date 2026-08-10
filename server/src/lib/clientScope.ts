import prisma from './prisma.js';
import {
  clientProgressBuckets,
  clientStageLabelForCode,
  getEngagementWorkflowMeta,
} from './workflowEngine.js';

/**
 * Resolves which Client record a portal user may access.
 * Staff User (role Client) → match contactEmail on Client, or linked ClientPortalUser email.
 */
export async function resolveClientIdForPortalUser(
  userId: string,
  email: string,
  firmId: string | null
): Promise<{ clientId: string | null; clientName: string | null }> {
  const portalByUser = await prisma.clientPortalUser.findFirst({
    where: { userId },
    select: { clientId: true, client: { select: { name: true } } },
  });
  if (portalByUser) {
    return { clientId: portalByUser.clientId, clientName: portalByUser.client.name };
  }

  const portal = await prisma.clientPortalUser.findUnique({
    where: { email },
    select: { clientId: true, client: { select: { name: true } } },
  });
  if (portal) {
    return { clientId: portal.clientId, clientName: portal.client.name };
  }

  if (firmId) {
    const byContact = await prisma.client.findFirst({
      where: { firmId, contactEmail: email, isActive: true },
      select: { id: true, name: true },
    });
    if (byContact) {
      return { clientId: byContact.id, clientName: byContact.name };
    }
  }

  // Legacy: single engagement membership as client contact (if ever added)
  const memberEng = await prisma.engagementMember.findFirst({
    where: { userId },
    select: { engagement: { select: { clientId: true, client: { select: { name: true } } } } },
  });
  if (memberEng?.engagement?.clientId) {
    return {
      clientId: memberEng.engagement.clientId,
      clientName: memberEng.engagement.client?.name ?? null,
    };
  }

  return { clientId: null, clientName: null };
}

export const WORKFLOW_STAGES = [
  'Data Pending',
  'Data Received',
  'Execution (WIP)',
  'Draft Ready',
  'Review with Manager',
  'Partner Review',
  'Client Discussion',
  'UDIN Generated',
  'Filed',
  'Archived',
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

// Client-visible 5-step progress mapping
export const CLIENT_PROGRESS_STEPS = [
  { label: 'Data Pending', stages: ['Data Pending', 'Data Received'] },
  { label: 'Draft Ready', stages: ['Execution (WIP)', 'Draft Ready'] },
  { label: 'Under Review', stages: ['Review with Manager', 'Partner Review'] },
  { label: 'Sign-off', stages: ['Client Discussion', 'UDIN Generated'] },
  { label: 'Filed', stages: ['Filed', 'Archived'] },
] as const;

export function stageIndex(stage: string): number {
  const idx = WORKFLOW_STAGES.indexOf(stage as WorkflowStage);
  return idx >= 0 ? idx : 0;
}

export function clientProgressIndex(stage: string): number {
  for (let i = 0; i < CLIENT_PROGRESS_STEPS.length; i++) {
    if (CLIENT_PROGRESS_STEPS[i].stages.includes(stage as never)) return i;
  }
  return 0;
}

/** Template-aware client progress for DT / IDT / Audit engagements */
export function clientProgressForEngagement(eng: {
  currentStage: string;
  workflowDomain?: string | null;
  serviceCode?: string | null;
  type?: string | null;
}): { progressStep: number; progressSteps: string[]; stageDescription: string; currentStageLabel: string } {
  const meta = getEngagementWorkflowMeta(eng);
  const buckets = clientProgressBuckets(meta.templateId);
  const progressSteps = buckets.map((b) => b.label);
  let progressStep = 0;
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].codes.includes(meta.currentCode)) {
      progressStep = i;
      break;
    }
  }
  const stageDescription = clientStageLabelForCode(meta.currentCode, meta.templateId);
  return {
    progressStep,
    progressSteps,
    stageDescription,
    currentStageLabel: meta.currentLabel,
  };
}

export function isEngagementActivated(eng: {
  partnerInChargeId: string | null;
  managerId: string | null;
  articleAssistantId: string | null;
}): boolean {
  return !!(eng.partnerInChargeId || eng.managerId || eng.articleAssistantId);
}

export function stageDescriptionForClient(stage: string): string {
  const map: Record<string, string> = {
    'Data Pending': "We're waiting for your documents. Please upload the required files.",
    'Data Received': 'Your documents have been received. The team will begin work shortly.',
    'Execution (WIP)': 'The team is working on your engagement. No action needed from you right now.',
    'Draft Ready': 'A draft has been prepared and is being reviewed internally.',
    'Review with Manager': 'Your engagement is being reviewed by the manager.',
    'Partner Review': 'The Partner is reviewing your engagement.',
    'Client Discussion': 'The team may reach out to discuss findings with you.',
    'UDIN Generated': 'Your report has been signed and is ready for filing.',
    'Filed': 'Your engagement has been filed successfully.',
    'Archived': 'This engagement is complete.',
  };
  return map[stage] ?? 'Your engagement is in progress.';
}

/** Plain-language stage labels for client notifications (no internal jargon). */
export function clientStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    'Data Pending': 'Waiting for your documents',
    'Data Received': 'Documents received',
    'Execution (WIP)': 'Work in progress',
    'Draft Ready': 'Draft ready for review',
    'Review with Manager': 'Under manager review',
    'Partner Review': 'Under partner review',
    'Client Discussion': 'Discussion with you',
    'UDIN Generated': 'Sign-off complete',
    'Filed': 'Filed with authorities',
    'Archived': 'Completed',
  };
  return labels[stage] ?? 'Updated';
}

export async function getClientPortalUserIds(clientId: string): Promise<string[]> {
  const rows = await prisma.clientPortalUser.findMany({
    where: { clientId, isActive: true, userId: { not: null } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId!).filter(Boolean);
}

export async function notifyClientPortalUsers(
  clientId: string,
  payload: { title: string; message: string; link?: string; type?: 'info' | 'success' | 'warning' },
  options?: { preference?: 'notifyStageChanges' | 'notifyDocumentRequests' | 'notifyInvoices' }
): Promise<void> {
  let userIds = await getClientPortalUserIds(clientId);
  if (userIds.length === 0) return;

  if (options?.preference) {
    const optedIn = await prisma.user.findMany({
      where: { id: { in: userIds }, [options.preference]: true },
      select: { id: true },
    });
    userIds = optedIn.map((u) => u.id);
    if (userIds.length === 0) return;
  }

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      title: payload.title,
      message: payload.message,
      type: payload.type ?? 'info',
      link: payload.link ?? '/client/dashboard',
    })),
  });

  // Real-time push so the portal updates without a manual refresh.
  // Lazy import avoids a circular dependency with the server entrypoint.
  try {
    const { io } = await import('../index.js');
    for (const userId of userIds) {
      io.to(`user:${userId}`).emit('portal-notification', {
        title: payload.title,
        message: payload.message,
        link: payload.link ?? '/client/dashboard',
        type: payload.type ?? 'info',
      });
    }
  } catch {
    // Socket layer unavailable (e.g. during tests) — DB notification still delivered.
  }
}

/** Mark unread portal notifications read after the client completes the related action. */
export async function markClientPortalNotificationsRead(
  clientId: string,
  predicate: { titleIncludes?: string; link?: string }
): Promise<void> {
  const userIds = await getClientPortalUserIds(clientId);
  if (userIds.length === 0) return;

  await prisma.notification.updateMany({
    where: {
      userId: { in: userIds },
      isRead: false,
      ...(predicate.titleIncludes
        ? { title: { contains: predicate.titleIncludes } }
        : {}),
      ...(predicate.link ? { link: predicate.link } : {}),
    },
    data: { isRead: true },
  });
}
