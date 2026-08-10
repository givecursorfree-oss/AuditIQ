import prisma from '../../lib/prisma.js';
import type {
  ClientRequestRepository,
  CreateEngagementFromRequestInput,
  PendingClientRequestRow,
} from '../ports.js';

export const prismaClientRequestRepository: ClientRequestRepository = {
  async findPendingById(requestId, firmId) {
    return prisma.clientRequest.findFirst({
      where: { id: requestId, firmId, status: 'pending' },
      include: { client: true },
    }) as Promise<PendingClientRequestRow | null>;
  },

  async approveWithEngagements(requestId, reviewerId, engagements) {
    return prisma.$transaction(async (tx) => {
      const created = [];
      for (const data of engagements) {
        const eng = await tx.engagement.create({
          data: {
            ...data,
            status: 'Planning',
            currentStage: 'Engagement request',
            requestStatus: 'awaiting_letter_signature',
            letterStatus: 'draft',
          },
        });
        created.push(eng);
      }
      await tx.clientRequest.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
      });
      return created;
    });
  },

  async reject(requestId, firmId, reviewerId, reason) {
    await prisma.clientRequest.updateMany({
      where: { id: requestId, firmId, status: 'pending' },
      data: {
        status: 'rejected',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
  },
};
