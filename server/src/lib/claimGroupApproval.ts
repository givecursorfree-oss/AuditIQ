import { Prisma } from '@prisma/client';
import prisma from './prisma.js';

export type ParticipantInput = {
  userId: string;
  engagementId?: string;
  clientId?: string;
  workType?: string;
  workTypeOther?: string;
};

type EngagementManagers = {
  managerId: string | null;
  partnerInChargeId: string | null;
  articleAssistantId: string | null;
};

export function equalShare(amount: number, count: number): number {
  if (count <= 0) return amount;
  return Math.round((amount / count) * 100) / 100;
}

function managerFromEngagement(eng: EngagementManagers | undefined): string | null {
  if (!eng) return null;
  return eng.managerId ?? eng.partnerInChargeId ?? eng.articleAssistantId ?? null;
}

export function resolveParticipantManagerId(
  reportsToId: string | null | undefined,
  engagementId: string | null | undefined,
  engagementMap: Map<string, EngagementManagers>
): string | null {
  if (reportsToId) return reportsToId;
  if (!engagementId) return null;
  return managerFromEngagement(engagementMap.get(engagementId));
}

async function loadEngagementManagerMap(
  engagementIds: string[]
): Promise<Map<string, EngagementManagers>> {
  const unique = [...new Set(engagementIds.filter(Boolean))] as string[];
  if (unique.length === 0) return new Map();

  const rows = await prisma.engagement.findMany({
    where: { id: { in: unique } },
    select: { id: true, managerId: true, partnerInChargeId: true, articleAssistantId: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

export async function createParticipantsAndApprovals(
  claimId: string,
  amount: number,
  participants: ParticipantInput[]
): Promise<void> {
  // Deduplicate by userId (last wins metadata); keep order for stable shares
  const seen = new Set<string>();
  const unique = participants.filter((p) => {
    if (seen.has(p.userId)) return false;
    seen.add(p.userId);
    return true;
  });
  const share = equalShare(amount, unique.length);
  // Remainder on last participant so shares sum to claim amount
  const shares = unique.map((_, i) =>
    i === unique.length - 1
      ? Math.round((amount - share * (unique.length - 1)) * 100) / 100
      : share
  );
  const users = await prisma.user.findMany({
    where: { id: { in: unique.map((p) => p.userId) } },
    select: { id: true, reportsToId: true },
  });
  const reportsMap = new Map(users.map((u) => [u.id, u.reportsToId]));
  const engagementMap = await loadEngagementManagerMap(unique.map((p) => p.engagementId ?? ''));

  await prisma.expenseClaimParticipant.createMany({
    data: unique.map((p, i) => ({
      claimId,
      userId: p.userId,
      engagementId: p.engagementId,
      clientId: p.clientId,
      workType: p.workType,
      workTypeOther: p.workTypeOther,
      amountShare: shares[i],
      managerId: resolveParticipantManagerId(reportsMap.get(p.userId), p.engagementId, engagementMap),
    })),
  });

  const byManager = new Map<string, number>();
  for (let i = 0; i < unique.length; i++) {
    const p = unique[i];
    const mgr = resolveParticipantManagerId(reportsMap.get(p.userId), p.engagementId, engagementMap);
    if (!mgr) continue;
    byManager.set(mgr, (byManager.get(mgr) ?? 0) + shares[i]);
  }

  for (const [managerId, teamAmount] of byManager) {
    await prisma.expenseClaimManagerApproval.create({
      data: { claimId, managerId, teamAmount, status: 'pending' },
    });
  }
}

/** Backfill manager approval rows for claims submitted before engagement-manager routing. */
export async function repairMissingClaimManagerApprovals(firmId?: string): Promise<number> {
  const claims = await prisma.expenseClaim.findMany({
    where: {
      ...(firmId ? { firmId } : {}),
      claimStatus: { in: ['pending_approval', 'partially_approved'] },
    },
    include: { participants: true, managerApprovals: true },
  });

  let fixed = 0;

  for (const claim of claims) {
    let participants = claim.participants;

    if (participants.length === 0) {
      const staff = await prisma.user.findUnique({
        where: { id: claim.staffId },
        select: { reportsToId: true },
      });
      const engagementMap = await loadEngagementManagerMap([claim.engagementId ?? '']);
      const managerId = resolveParticipantManagerId(
        staff?.reportsToId,
        claim.engagementId,
        engagementMap
      );
      await prisma.expenseClaimParticipant.create({
        data: {
          claimId: claim.id,
          userId: claim.staffId,
          engagementId: claim.engagementId,
          clientId: claim.clientId,
          workType: claim.workType,
          workTypeOther: claim.workTypeOther,
          amountShare: claim.amount,
          managerId,
        },
      });
      participants = await prisma.expenseClaimParticipant.findMany({ where: { claimId: claim.id } });
      fixed++;
    }

    const engagementMap = await loadEngagementManagerMap(
      participants.map((p) => p.engagementId ?? '')
    );
    const userRows = await prisma.user.findMany({
      where: { id: { in: participants.map((p) => p.userId) } },
      select: { id: true, reportsToId: true },
    });
    const reportsMap = new Map(userRows.map((u) => [u.id, u.reportsToId]));

    const byManager = new Map<string, number>();
    for (const p of participants) {
      const mgrId = resolveParticipantManagerId(
        reportsMap.get(p.userId),
        p.engagementId,
        engagementMap
      );
      if (p.managerId !== mgrId) {
        await prisma.expenseClaimParticipant.update({
          where: { id: p.id },
          data: { managerId: mgrId },
        });
      }
      if (!mgrId) continue;
      byManager.set(mgrId, (byManager.get(mgrId) ?? 0) + Number(p.amountShare));
    }

    const currentApprovals = await prisma.expenseClaimManagerApproval.findMany({
      where: { claimId: claim.id },
    });

    if (claim.claimStatus === 'pending_approval' && byManager.size > 0) {
      const wanted = new Set(byManager.keys());
      for (const row of currentApprovals) {
        if (row.status === 'pending' && !wanted.has(row.managerId)) {
          await prisma.expenseClaimManagerApproval.delete({ where: { id: row.id } });
          fixed++;
        }
      }
    }

    for (const [managerId, teamAmount] of byManager) {
      const exists = currentApprovals.some((a) => a.managerId === managerId);
      if (!exists) {
        await prisma.expenseClaimManagerApproval.create({
          data: { claimId: claim.id, managerId, teamAmount, status: 'pending' },
        });
        fixed++;
      }
    }
  }

  return fixed;
}

export async function recomputeClaimStatus(claimId: string): Promise<void> {
  const approvals = await prisma.expenseClaimManagerApproval.findMany({ where: { claimId } });
  // No manager rows: Partner/Admin must call finalizeClaimWithoutManagers
  if (approvals.length === 0) return;

  if (approvals.some((a) => a.status === 'rejected')) {
    await prisma.expenseClaim.update({
      where: { id: claimId },
      data: { claimStatus: 'rejected', approvedAmount: null },
    });
    return;
  }

  const allDone = approvals.every((a) => a.status !== 'pending');
  const anyPartial = approvals.some((a) => a.status === 'partially_approved');
  const approvedSum = approvals.reduce((s, a) => {
    if (a.status === 'approved') return s + Number(a.teamAmount);
    if (a.status === 'partially_approved' && a.approvedAmount != null) return s + Number(a.approvedAmount);
    return s;
  }, 0);

  let claimStatus: string;
  if (!allDone) {
    const anyAction = approvals.some((a) => a.status !== 'pending');
    claimStatus = anyAction ? 'partially_approved' : 'pending_approval';
  } else if (anyPartial) {
    claimStatus = 'partially_approved';
  } else {
    claimStatus = 'approved';
  }

  const lastReview = approvals
    .filter((a) => a.reviewedAt)
    .sort((a, b) => b.reviewedAt!.getTime() - a.reviewedAt!.getTime())[0];

  await prisma.expenseClaim.update({
    where: { id: claimId },
    data: {
      claimStatus,
      approvedAmount: allDone || anyPartial ? new Prisma.Decimal(approvedSum) : null,
      managerReviewedById: lastReview?.reviewedById ?? undefined,
      managerReviewedAt: lastReview?.reviewedAt ?? undefined,
    },
  });
}

/** Partner/Admin approve when claim has no ExpenseClaimManagerApproval rows. */
export async function finalizeClaimWithoutManagers(
  claimId: string,
  reviewerId: string,
  opts: { approvedAmount: number; status: 'approved' | 'partially_approved'; reason?: string }
): Promise<void> {
  await prisma.expenseClaim.update({
    where: { id: claimId },
    data: {
      claimStatus: opts.status,
      approvedAmount: opts.approvedAmount,
      partialApproveReason: opts.reason,
      managerReviewedById: reviewerId,
      managerReviewedAt: new Date(),
    },
  });
}
