import {
  prismaClientRequestRepository,
} from './prisma/clientRequestRepository.js';
import { prismaNotificationRepository } from './prisma/notificationRepository.js';
import {
  prismaDocumentTemplateRepository,
  prismaEngagementLetterRepository,
  prismaEngagementRepository,
  prismaUserRepository,
} from './prisma/engagementWorkflowRepositories.js';
import type {
  ClientRequestRepository,
  DocumentTemplateRepository,
  EngagementLetterRepository,
  EngagementRepository,
  NotificationRepository,
  UserRepository,
} from './ports.js';

export type MkdWorkflowDeps = {
  clientRequests: ClientRequestRepository;
  notifications: NotificationRepository;
  engagements: EngagementRepository;
  engagementLetters: EngagementLetterRepository;
  documentTemplates: DocumentTemplateRepository;
  users: UserRepository;
};

/** Composition root — wire Prisma adapters for MKD workflow use cases. */
export const mkdWorkflowDeps: MkdWorkflowDeps = {
  clientRequests: prismaClientRequestRepository,
  notifications: prismaNotificationRepository,
  engagements: prismaEngagementRepository,
  engagementLetters: prismaEngagementLetterRepository,
  documentTemplates: prismaDocumentTemplateRepository,
  users: prismaUserRepository,
};
