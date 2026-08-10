import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import type {
  DocumentTemplateRepository,
  EngagementLetterRepository,
  EngagementRepository,
  UserRepository,
} from '../ports.js';

export const prismaEngagementRepository: EngagementRepository = {
  async findForLetterWorkflow(engagementId, firmId) {
    return prisma.engagement.findFirst({
      where: { id: engagementId, firmId },
      include: { client: true, clientRequest: true, firm: true },
    });
  },

  async updateLetterStatus(engagementId, data) {
    await prisma.engagement.update({ where: { id: engagementId }, data });
  },

  async updateManyByClientRequestId(clientRequestId, data) {
    await prisma.engagement.updateMany({ where: { clientRequestId }, data });
  },

  async updateEngagementLetterArtifacts(engagementId, data) {
    await prisma.engagement.update({ where: { id: engagementId }, data });
  },
};

export const prismaEngagementLetterRepository: EngagementLetterRepository = {
  async upsertDraft(input) {
    return prisma.engagementLetter.upsert({
      where: { engagementId: input.engagementId },
      create: {
        engagementId: input.engagementId,
        clientId: input.clientId,
        templateId: input.templateId,
        generatedContent: input.generatedContent,
        subjectLine: input.subjectLine,
        docxPath: input.docxPath,
        status: 'draft',
        fees: input.fees as Prisma.InputJsonValue | undefined,
        partnerName: input.partnerName,
        createdById: input.createdById,
      },
      update: {
        templateId: input.templateId,
        generatedContent: input.generatedContent,
        subjectLine: input.subjectLine,
        docxPath: input.docxPath,
        status: 'draft',
        fees: input.fees as Prisma.InputJsonValue | undefined,
        partnerName: input.partnerName,
      },
    });
  },

  async updateDraft(letterId, input) {
    return prisma.engagementLetter.update({
      where: { id: letterId },
      data: {
        generatedContent: input.generatedContent,
        subjectLine: input.subjectLine,
        fees: input.fees as Prisma.InputJsonValue | undefined,
        partnerName: input.partnerName,
        docxPath: input.docxPath,
      },
    });
  },

  async findByIdForFirm(letterId, firmId) {
    return prisma.engagementLetter.findFirst({
      where: { id: letterId, engagement: { firmId } },
      include: { engagement: true, client: true, template: true },
    });
  },

  async findByIdWithEngagementForSign(letterId, firmId) {
    return prisma.engagementLetter.findFirst({
      where: { id: letterId, engagement: { firmId } },
      include: { engagement: { include: { client: true, firm: true } } },
    });
  },

  async markSent(letterId, sentAt, docxPath?: string) {
    return prisma.engagementLetter.update({
      where: { id: letterId },
      data: { status: 'sent', sentAt, ...(docxPath ? { docxPath } : {}) },
    });
  },

  async findByEngagementId(engagementId) {
    return prisma.engagementLetter.findUnique({ where: { engagementId } });
  },

  async markSigned(letterId, input) {
    return prisma.engagementLetter.update({
      where: { id: letterId },
      data: {
        status: 'signed',
        signedAt: input.signedAt,
        signedDocumentUrl: input.signedDocumentUrl,
        clientSignatoryName: input.clientSignatoryName,
      },
    });
  },
};

export const prismaDocumentTemplateRepository: DocumentTemplateRepository = {
  async findActiveForFirm(firmId, templateId) {
    if (templateId) {
      return prisma.documentTemplate.findFirst({
        where: { id: templateId, firmId, isActive: true },
      });
    }
    return prisma.documentTemplate.findFirst({
      where: { firmId, category: 'engagement_letter', isActive: true },
    });
  },
};

export const prismaUserRepository: UserRepository = {
  async findDisplayName(userId) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim() || 'Partner';
  },
};
