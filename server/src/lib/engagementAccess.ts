import { Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from './prisma.js';
import type { AuthRequest } from '../middleware/auth.js';
import {
  assignedEngagementWhere,
  engagementAccessWhereForProfile,
  hasFirmWideEngagementAccess,
  isAccountsManager,
  type EngagementAccessProfile,
} from './engagementAccessPolicy.js';

export type { EngagementAccessProfile } from './engagementAccessPolicy.js';

export async function loadEngagementAccessProfile(userId: string): Promise<EngagementAccessProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      firmId: true,
      reportsToId: true,
      hierarchyLevel: { select: { code: true } },
    },
  });
  if (!user) return null;
  return {
    userId: user.id,
    role: user.role,
    firmId: user.firmId,
    hierarchyCode: user.hierarchyLevel?.code ?? null,
    reportsToId: user.reportsToId,
  };
}

function profileFromArgs(
  userId: string,
  role: string,
  firmId: string | null,
  hierarchyCode?: string | null,
  reportsToId?: string | null
): EngagementAccessProfile {
  return { userId, role, firmId, hierarchyCode: hierarchyCode ?? null, reportsToId: reportsToId ?? null };
}

async function resolveProfile(
  userId: string,
  role: string,
  firmId: string | null,
  hierarchyCode?: string | null,
  reportsToId?: string | null
): Promise<EngagementAccessProfile> {
  if (hierarchyCode !== undefined) {
    return profileFromArgs(userId, role, firmId, hierarchyCode, reportsToId);
  }
  const loaded = await loadEngagementAccessProfile(userId);
  if (loaded) return loaded;
  return profileFromArgs(userId, role, firmId, null, null);
}

function matchesAssignedEngagement(
  userId: string,
  engagement: {
    partnerInChargeId: string | null;
    managerId: string | null;
    articleAssistantId: string | null;
  },
  isMember: boolean,
  hasTask: boolean
): boolean {
  return (
    engagement.partnerInChargeId === userId ||
    engagement.managerId === userId ||
    engagement.articleAssistantId === userId ||
    isMember ||
    hasTask
  );
}

export async function canAccessEngagement(
  userId: string,
  role: string,
  firmId: string | null,
  engagementId: string,
  hierarchyCode?: string | null,
  reportsToId?: string | null
): Promise<boolean> {
  const profile = await resolveProfile(userId, role, firmId, hierarchyCode, reportsToId);

  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: {
      firmId: true,
      partnerInChargeId: true,
      managerId: true,
      articleAssistantId: true,
      currentStage: true,
      filedAt: true,
      archivedAt: true,
    },
  });
  if (!engagement) return false;
  if (!profile.firmId || engagement.firmId !== profile.firmId) return false;

  if (hasFirmWideEngagementAccess(profile.role, profile.hierarchyCode)) return true;

  if (isAccountsManager(profile.role, profile.hierarchyCode)) {
    const billingStage = ['Billing', 'BILLING'].includes(engagement.currentStage);
    const pendingBilling =
      engagement.filedAt != null &&
      engagement.archivedAt == null &&
      !billingStage;
    return billingStage || pendingBilling;
  }

  const member = await prisma.engagementMember.findFirst({
    where: { userId: profile.userId, engagementId },
    select: { id: true },
  });

  const linkedTask = await prisma.task.findFirst({
    where: {
      engagementId,
      OR: [{ assigneeId: profile.userId }, { createdById: profile.userId }],
    },
    select: { id: true },
  });

  if (
    matchesAssignedEngagement(
      profile.userId,
      engagement,
      !!member,
      !!linkedTask
    )
  ) {
    return true;
  }

  // Intern: inherit supervisor's engagements
  if (profile.reportsToId && (profile.role === 'Intern' || profile.hierarchyCode === 'INTERN')) {
    const supMember = await prisma.engagementMember.findFirst({
      where: { userId: profile.reportsToId, engagementId },
    });
    if (supMember) return true;
    if (
      engagement.partnerInChargeId === profile.reportsToId ||
      engagement.managerId === profile.reportsToId ||
      engagement.articleAssistantId === profile.reportsToId
    ) {
      return true;
    }
  }

  return false;
}

export async function requireEngagementAccess(
  req: AuthRequest,
  res: Response,
  engagementId: string
): Promise<boolean> {
  const user = req.user!;
  const profile = await resolveProfile(user.id, user.role, user.firmId);
  const allowed = await canAccessEngagement(
    user.id,
    user.role,
    user.firmId,
    engagementId,
    profile.hierarchyCode,
    profile.reportsToId
  );
  if (!allowed) {
    res.status(403).json({ error: 'Access denied to this engagement' });
    return false;
  }
  return true;
}

export async function requireWorkpaperAccess(
  req: AuthRequest,
  res: Response,
  workpaperId: string
): Promise<boolean> {
  const wp = await prisma.workpaper.findUnique({
    where: { id: workpaperId },
    select: { engagementId: true },
  });
  if (!wp) {
    res.status(404).json({ error: 'Workpaper not found' });
    return false;
  }
  return requireEngagementAccess(req, res, wp.engagementId);
}

export async function requireReportAccess(
  req: AuthRequest,
  res: Response,
  reportId: string
): Promise<boolean> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { engagementId: true },
  });
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return false;
  }
  return requireEngagementAccess(req, res, report.engagementId);
}

export async function requireForm3cdClauseAccess(
  req: AuthRequest,
  res: Response,
  clauseId: string
): Promise<boolean> {
  const clause = await prisma.form3CDClause.findUnique({
    where: { id: clauseId },
    select: { reportId: true },
  });
  if (!clause) {
    res.status(404).json({ error: 'Clause not found' });
    return false;
  }
  return requireReportAccess(req, res, clause.reportId);
}

export async function engagementIdsFilter(
  userId: string,
  role: string,
  firmId: string | null,
  hierarchyCode?: string | null,
  reportsToId?: string | null
): Promise<{ engagementId: { in: string[] } }> {
  const ids = await listAccessibleEngagementIds(userId, role, firmId, hierarchyCode, reportsToId);
  return { engagementId: { in: ids } };
}

export function engagementAccessWhere(
  userId: string,
  role: string,
  firmId: string | null,
  hierarchyCode?: string | null,
  reportsToId?: string | null
): Prisma.EngagementWhereInput {
  return engagementAccessWhereForProfile(
    profileFromArgs(userId, role, firmId, hierarchyCode, reportsToId)
  );
}

export async function engagementAccessWhereForUser(userId: string): Promise<Prisma.EngagementWhereInput> {
  const profile = await loadEngagementAccessProfile(userId);
  if (!profile) return { id: { in: [] } };
  return engagementAccessWhereForProfile(profile);
}

export async function listAccessibleEngagementIds(
  userId: string,
  role: string,
  firmId: string | null,
  hierarchyCode?: string | null,
  reportsToId?: string | null
): Promise<string[]> {
  const where = engagementAccessWhere(userId, role, firmId, hierarchyCode, reportsToId);
  if (!firmId) return [];
  const rows = await prisma.engagement.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}

/** All user IDs on an engagement team (managers + staff + partner). */
export async function getEngagementTeamMemberIds(engagementId: string): Promise<string[]> {
  const eng = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: {
      partnerInChargeId: true,
      managerId: true,
      articleAssistantId: true,
      members: { select: { userId: true } },
    },
  });
  if (!eng) return [];
  const ids = new Set<string>();
  if (eng.partnerInChargeId) ids.add(eng.partnerInChargeId);
  if (eng.managerId) ids.add(eng.managerId);
  if (eng.articleAssistantId) ids.add(eng.articleAssistantId);
  for (const m of eng.members) ids.add(m.userId);
  return Array.from(ids);
}

export { assignedEngagementWhere, hasFirmWideEngagementAccess };
