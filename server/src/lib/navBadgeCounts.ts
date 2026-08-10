import prisma from './prisma.js';

import { isEngagementActivated, resolveClientIdForPortalUser } from './clientScope.js';

import { ackSince, getNavAckMap, type NavAttentionScope } from './navAttentionAck.js';



export type NavBadgeCounts = {

  notifications: number;

  approvals: number;

  messages: number;

  unassignedEngagements: number;

  incomingClients: number;

  openClientQueries: number;

  pendingDocuments: number;

  pendingLeaves: number;

  dashboardAttention: number;

  clientAttention: number;

  clientPendingDocuments: number;

  clientPendingActivation: number;

  clientOpenQueries: number;

  clientPendingLetters: number;

  pendingClientRequests: number;

  lettersNeedingTeam: number;

  workflowAttention: number;

};



export const EMPTY_NAV_BADGES: NavBadgeCounts = {

  notifications: 0,

  approvals: 0,

  messages: 0,

  unassignedEngagements: 0,

  incomingClients: 0,

  openClientQueries: 0,

  pendingDocuments: 0,

  pendingLeaves: 0,

  dashboardAttention: 0,

  clientAttention: 0,

  clientPendingDocuments: 0,

  clientPendingActivation: 0,

  clientOpenQueries: 0,

  clientPendingLetters: 0,

  pendingClientRequests: 0,

  lettersNeedingTeam: 0,

  workflowAttention: 0,

};



export async function countChatUnreadForUser(userId: string): Promise<number> {

  const participants = await prisma.chatParticipant.findMany({

    where: { userId, isArchived: false },

    select: { roomId: true, lastReadAt: true },

  });

  if (participants.length === 0) return 0;



  const counts = await Promise.all(

    participants.map((p) =>

      prisma.chatMessage.count({

        where: {

          roomId: p.roomId,

          createdAt: { gt: p.lastReadAt ?? new Date(0) },

          senderId: { not: userId },

          isDeleted: false,

        },

      })

    )

  );

  return counts.reduce((sum, n) => sum + n, 0);

}



export async function computeNavBadgesForUser(user: {

  id: string;

  role: string;

  email: string;

  firmId: string | null;

}): Promise<NavBadgeCounts> {

  const badges = { ...EMPTY_NAV_BADGES };

  const acks = await getNavAckMap(user.id);



  const [notifications, messages] = await Promise.all([

    prisma.notification.count({ where: { userId: user.id, isRead: false } }),

    countChatUnreadForUser(user.id),

  ]);

  badges.notifications = notifications;

  badges.messages = messages;



  if (user.role === 'Client') {

    const scope = await resolveClientIdForPortalUser(user.id, user.email, user.firmId);

    if (scope.clientId) {

      const clientAck = ackSince(acks, 'client-portal' as NavAttentionScope);

      const [engagements, pendingDocRequests, openQueries, pendingLetters] = await Promise.all([

        prisma.engagement.findMany({

          where: {

            clientId: scope.clientId,

            status: { notIn: ['Closed', 'Archived'] },

            updatedAt: { gt: clientAck },

          },

          select: {

            partnerInChargeId: true,

            managerId: true,

            articleAssistantId: true,

            _count: {

              select: {

                checklistItems: { where: { status: 'Requested' } },

              },

            },

          },

        }),

        prisma.documentRequest.count({

          where: {

            status: 'Pending',

            engagement: { clientId: scope.clientId },

            createdAt: { gt: clientAck },

          },

        }),

        prisma.clientAuditQuery.count({

          where: { clientId: scope.clientId, status: 'Open', createdAt: { gt: clientAck } },

        }),

        prisma.engagementLetter.count({

          where: {

            clientId: scope.clientId,

            status: 'sent',

            sentAt: { gt: clientAck },

          },

        }),

      ]);



      badges.clientPendingActivation = engagements.filter((e) => !isEngagementActivated(e)).length;

      badges.clientPendingLetters = pendingLetters;

      const checklistPending = engagements.reduce(

        (sum, e) => sum + (e._count?.checklistItems ?? 0),

        0

      );

      badges.clientPendingDocuments = pendingDocRequests + checklistPending;

      badges.clientOpenQueries = openQueries;

      badges.clientAttention =

        badges.clientPendingActivation +

        badges.clientPendingDocuments +

        badges.clientOpenQueries +

        badges.clientPendingLetters +

        badges.messages;

      badges.dashboardAttention = badges.clientAttention;

    }

    return badges;

  }



  if (!user.firmId) {

    badges.dashboardAttention = badges.approvals + badges.messages;

    return badges;

  }



  const firmId = user.firmId;

  const leadership = ['Admin', 'Partner', 'Manager'].includes(user.role);

  const canManageLeaves = ['Partner', 'Admin', 'Manager'].includes(user.role);



  const requestsSince = ackSince(acks, 'requests');

  const workflowSince = ackSince(acks, 'workflow');

  const clientsSince = ackSince(acks, 'clients');

  const documentsSince = ackSince(acks, 'documents');

  const queriesSince = ackSince(acks, 'queries');

  const lettersSince = ackSince(acks, 'letters');

  const dashboardSince = ackSince(acks, 'dashboard');



  const staffQueries: Promise<void>[] = [

    prisma.approvalRequest

      .count({

        where: {

          status: 'In Progress',

          steps: { some: { approverId: user.id, status: 'Pending' } },

        },

      })

      .then((count) => {

        badges.approvals = count;

      }),

  ];



  if (leadership) {

    staffQueries.push(

      Promise.all([

        prisma.engagement.count({

          where: {

            firmId,

            partnerInChargeId: null,

            managerId: null,

            articleAssistantId: null,

            status: { notIn: ['Closed', 'Archived'] },

            updatedAt: { gt: workflowSince },

          },

        }),

        prisma.client.count({

          where: { firmId, status: 'Prospect', isActive: true, createdAt: { gt: clientsSince } },

        }),

        prisma.clientAuditQuery.count({

          where: {

            status: 'Open',

            engagement: { firmId },

            createdAt: { gt: queriesSince },

          },

        }),

        prisma.documentRequest.count({

          where: {

            status: 'Pending',

            engagement: { firmId },

            createdAt: { gt: documentsSince },

          },

        }),

        prisma.clientRequest.count({

          where: { firmId, status: 'pending', submittedAt: { gt: requestsSince } },

        }),

        prisma.engagement.count({

          where: {

            firmId,

            letterStatus: 'signed',

            partnerInChargeId: null,

            managerId: null,

            articleAssistantId: null,

            status: { notIn: ['Closed', 'Archived'] },

            elSignedAt: { gt: lettersSince },

          },

        }),

      ]).then(

        ([unassigned, prospects, openQueries, pendingDocs, pendingRequests, lettersNeedingTeam]) => {

          badges.unassignedEngagements = unassigned;

          badges.incomingClients = prospects + unassigned;

          badges.openClientQueries = openQueries;

          badges.pendingDocuments = pendingDocs;

          badges.pendingClientRequests = pendingRequests;

          badges.lettersNeedingTeam = lettersNeedingTeam;

        }

      )

    );

  }



  if (canManageLeaves) {

    staffQueries.push(

      prisma.leaveRequest

        .count({

          where: {

            status: 'Pending',

            user: { firmId },

          },

        })

        .then((count) => {

          badges.pendingLeaves = count;

        })

    );

  }



  await Promise.all(staffQueries);

  if (leadership) {
    badges.workflowAttention = badges.unassignedEngagements + badges.lettersNeedingTeam;
    const dashboardActionable = await prisma.clientRequest.count({
      where: {
        firmId,
        status: 'pending',
        submittedAt: { gt: dashboardSince },
      },
    });
    const dashboardLetters = await prisma.engagement.count({
      where: {
        firmId,
        letterStatus: 'signed',
        partnerInChargeId: null,
        managerId: null,
        articleAssistantId: null,
        status: { notIn: ['Closed', 'Archived'] },
        elSignedAt: { gt: dashboardSince },
      },
    });
    badges.dashboardAttention =
      badges.approvals + dashboardActionable + dashboardLetters;
  } else {
    badges.dashboardAttention = badges.approvals + badges.messages;
  }

  return badges;
}

