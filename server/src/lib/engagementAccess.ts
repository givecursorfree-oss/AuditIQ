import { Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from './prisma.js';
import { isFirmLeadershipRole } from '../lib/permissions.js';
import type { AuthRequest } from '../middleware/auth.js';

export async function canAccessEngagement(
  userId: string,
  role: string,
  firmId: string | null,
  engagementId: string
): Promise<boolean> {
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: {
      firmId: true,
      partnerInChargeId: true,
      managerId: true,
      articleAssistantId: true,
    },
  });
  if (!engagement) return false;
  if (!firmId || engagement.firmId !== firmId) return false;
  if (isFirmLeadershipRole(role)) return true;

  if (
    engagement.partnerInChargeId === userId ||
    engagement.managerId === userId ||
    engagement.articleAssistantId === userId
  ) {
    return true;
  }

  const member = await prisma.engagementMember.findFirst({
    where: { userId, engagementId },
  });
  if (member) return true;

  const linkedTask = await prisma.task.findFirst({
    where: {
      engagementId,
      OR: [{ assigneeId: userId }, { createdById: userId }],
    },
    select: { id: true },
  });
  return !!linkedTask;
}

/** Send 403/404 and return false if access denied. */
export async function requireEngagementAccess(
  req: AuthRequest,
  res: Response,
  engagementId: string
): Promise<boolean> {
  const user = req.user!;
  const allowed = await canAccessEngagement(
    user.id,
    user.role,
    user.firmId,
    engagementId
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

/** Prisma filter: only engagements this user may see. */
export async function engagementIdsFilter(
  userId: string,
  role: string,
  firmId: string | null
): Promise<{ engagementId: { in: string[] } }> {
  if (!firmId) return { engagementId: { in: [] } };

  if (isFirmLeadershipRole(role)) {
    const engagements = await prisma.engagement.findMany({
      where: { firmId },
      select: { id: true },
    });
    return { engagementId: { in: engagements.map((e) => e.id) } };
  }

  const memberships = await prisma.engagementMember.findMany({
    where: { userId },
    select: { engagementId: true },
  });
  const taskEngagements = await prisma.task.findMany({
    where: {
      engagementId: { not: null },
      OR: [{ assigneeId: userId }, { createdById: userId }],
    },
    select: { engagementId: true },
    distinct: ['engagementId'],
  });
  const ids = [
    ...new Set([
      ...memberships.map((m) => m.engagementId),
      ...taskEngagements.map((t) => t.engagementId).filter((id): id is string => id != null),
    ]),
  ];
  return { engagementId: { in: ids } };
}

/** Prisma where: firm engagements visible to this user (Admin/Partner = all; others = assigned only). */
export function engagementAccessWhere(
  userId: string,
  role: string,
  firmId: string | null
): Prisma.EngagementWhereInput {
  if (!firmId) return { id: { in: [] } };
  if (isFirmLeadershipRole(role)) return { firmId };

  return {
    firmId,
    OR: [
      { members: { some: { userId } } },
      { partnerInChargeId: userId },
      { managerId: userId },
      { articleAssistantId: userId },
      { tasks: { some: { OR: [{ assigneeId: userId }, { createdById: userId }] } } },
    ],
  };
}

/** Engagement IDs a user may access (team assignment, membership, or privileged firm-wide). */
export async function listAccessibleEngagementIds(
  userId: string,
  role: string,
  firmId: string | null
): Promise<string[]> {
  if (!firmId) return [];

  if (isFirmLeadershipRole(role)) {
    const rows = await prisma.engagement.findMany({
      where: { firmId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  const engagements = await prisma.engagement.findMany({
    where: {
      firmId,
      OR: [
        { members: { some: { userId } } },
        { partnerInChargeId: userId },
        { managerId: userId },
        { articleAssistantId: userId },
        { tasks: { some: { OR: [{ assigneeId: userId }, { createdById: userId }] } } },
      ],
    },
    select: { id: true },
  });
  return engagements.map((e) => e.id);
}
