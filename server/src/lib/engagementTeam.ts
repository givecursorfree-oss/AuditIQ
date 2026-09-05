import prisma from './prisma.js';

const MANAGER_ROLES = new Set(['Partner', 'Admin', 'Manager']);
const STAFF_ROLES = new Set(['Partner', 'Admin', 'Manager', 'Staff', 'Intern']);

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  initials: true,
  role: true,
  designation: true,
} as const;

export async function getEngagementTeam(engagementId: string) {
  const eng = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: {
      partnerInChargeId: true,
      managerId: true,
      articleAssistantId: true,
      members: {
        where: { teamRole: { not: null } },
        include: { user: { select: userSelect } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!eng) return null;

  const managerMembers = eng.members.filter((m) => m.teamRole === 'Manager');
  const staffMembers = eng.members.filter((m) => m.teamRole === 'Staff');
  const managers = managerMembers
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => m.user);
  const staff = staffMembers.sort((a, b) => a.sortOrder - b.sortOrder).map((m) => m.user);

  const primaryIds = [eng.partnerInChargeId, eng.managerId, eng.articleAssistantId].filter(Boolean) as string[];
  const primaryUsers =
    primaryIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: primaryIds } }, select: userSelect })
      : [];
  const userMap = new Map(primaryUsers.map((u) => [u.id, u]));

  return {
    managers,
    staff,
    managerIds: managers.map((m) => m.id),
    staffIds: staff.map((s) => s.id),
    primary: {
      partner: eng.partnerInChargeId ? userMap.get(eng.partnerInChargeId) ?? null : null,
      manager: eng.managerId ? userMap.get(eng.managerId) ?? null : null,
      article: eng.articleAssistantId ? userMap.get(eng.articleAssistantId) ?? null : null,
    },
  };
}

export async function getEngagementStaffIds(engagementId: string): Promise<string[]> {
  const team = await getEngagementTeam(engagementId);
  if (!team) return [];
  const ids = new Set<string>();
  for (const s of team.staff) ids.add(s.id);
  if (team.primary.article) ids.add(team.primary.article.id);
  return Array.from(ids);
}

export function validateTeamUserRoles(
  users: { id: string; role: string }[],
  managerIds: string[],
  staffIds: string[]
): string | null {
  for (const id of managerIds) {
    const u = users.find((x) => x.id === id);
    if (!u || !MANAGER_ROLES.has(u.role)) {
      return 'Managers must have Manager role or above';
    }
  }
  for (const id of staffIds) {
    const u = users.find((x) => x.id === id);
    if (!u || !STAFF_ROLES.has(u.role)) {
      return 'Staff must have Staff/Intern role or above';
    }
  }
  return null;
}

/** Preserve array order — index 0 is primary manager / staff on the engagement. */
function dedupePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Build EngagementMember rows — one row per user (unique on engagementId+userId). */
export function buildTeamMemberRows(
  engagementId: string,
  managerIds: string[],
  staffIds: string[],
  partnerId?: string | null
) {
  const uniqueManagers = dedupePreserveOrder(managerIds);
  const uniqueStaff = dedupePreserveOrder(staffIds);
  const claimed = new Set<string>([...uniqueManagers, ...uniqueStaff]);

  const memberRows: {
    engagementId: string;
    userId: string;
    teamRole: string;
    role: string;
    sortOrder: number;
  }[] = [
    ...uniqueManagers.map((userId, index) => ({
      engagementId,
      userId,
      teamRole: 'Manager',
      role: 'Lead',
      sortOrder: index,
    })),
    ...uniqueStaff.map((userId, index) => ({
      engagementId,
      userId,
      teamRole: 'Staff',
      role: 'Preparer',
      sortOrder: index,
    })),
  ];

  // Partner lives on engagement.partnerInChargeId; only add a member row when not already manager/staff.
  if (partnerId && !claimed.has(partnerId)) {
    memberRows.push({
      engagementId,
      userId: partnerId,
      teamRole: 'Partner',
      role: 'Lead',
      sortOrder: 0,
    });
  }

  return { uniqueManagers, uniqueStaff, memberRows };
}

export async function setEngagementTeam(
  engagementId: string,
  managerIds: string[],
  staffIds: string[],
  changedById: string,
  partnerId?: string | null
) {
  const { uniqueManagers, uniqueStaff, memberRows } = buildTeamMemberRows(
    engagementId,
    managerIds,
    staffIds,
    partnerId
  );

  await prisma.$transaction(async (tx) => {
    await tx.engagementMember.deleteMany({
      where: { engagementId, teamRole: { not: null } },
    });

    if (memberRows.length > 0) {
      await tx.engagementMember.createMany({ data: memberRows, skipDuplicates: true });
    }

    await tx.engagement.update({
      where: { id: engagementId },
      data: {
        // explicit null clears partner; omit only when caller did not pass partnerId
        ...(partnerId !== undefined ? { partnerInChargeId: partnerId } : {}),
        managerId: uniqueManagers[0] ?? null,
        articleAssistantId: uniqueStaff[0] ?? null,
        teamLastChangedById: changedById,
        teamLastChangedAt: new Date(),
      },
    });
  });
}
