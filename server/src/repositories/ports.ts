import type { Client, Engagement, EngagementLetter, DocumentTemplate, Firm } from '@prisma/client';

export type PendingClientRequestRow = {
  id: string;
  firmId: string;
  clientId: string;
  selectedServices: unknown;
  financialYears: unknown;
  notes: string | null;
  client: Pick<Client, 'name'>;
};

export type CreateEngagementFromRequestInput = {
  title: string;
  type: string;
  financialYear: string;
  workflowDomain: string;
  serviceCode: string;
  scopeIncluded: string;
  isRecurring: boolean;
  recurringFrequency: string | null;
  firmId: string;
  clientId: string;
  clientRequestId: string;
};

export interface ClientRequestRepository {
  findPendingById(requestId: string, firmId: string): Promise<PendingClientRequestRow | null>;
  approveWithEngagements(
    requestId: string,
    reviewerId: string,
    engagements: CreateEngagementFromRequestInput[]
  ): Promise<Engagement[]>;
  reject(requestId: string, firmId: string, reviewerId: string, reason: string | null): Promise<void>;
}

export interface NotificationRepository {
  notifyFirmPartners(input: {
    firmId: string;
    title: string;
    message: string;
    link: string;
  }): Promise<void>;
}

export type EngagementWithLetterContext = Engagement & {
  client: Client;
  firm: Firm;
  clientRequest: { selectedServices: unknown; financialYears: unknown } | null;
};

export interface EngagementRepository {
  findForLetterWorkflow(engagementId: string, firmId: string): Promise<EngagementWithLetterContext | null>;
  updateLetterStatus(engagementId: string, data: Record<string, unknown>): Promise<void>;
  updateManyByClientRequestId(clientRequestId: string, data: Record<string, unknown>): Promise<void>;
  updateEngagementLetterArtifacts(
    engagementId: string,
    data: { elGenerated: boolean; elStoragePath: string }
  ): Promise<void>;
}

export interface EngagementLetterRepository {
  upsertDraft(input: {
    engagementId: string;
    clientId: string;
    templateId?: string;
    generatedContent: string;
    subjectLine?: string;
    fees?: unknown;
    partnerName: string;
    createdById: string;
    docxPath?: string;
  }): Promise<EngagementLetter>;
  updateDraft(
    letterId: string,
    input: {
      generatedContent?: string;
      subjectLine?: string;
      fees?: unknown;
      partnerName?: string;
      docxPath?: string;
    }
  ): Promise<EngagementLetter>;
  findByIdForFirm(letterId: string, firmId: string): Promise<
    | (EngagementLetter & {
        engagement: Engagement;
        client: Client;
        template: Pick<DocumentTemplate, 'id' | 'name' | 'subject'> | null;
      })
    | null
  >;
  findByIdWithEngagementForSign(
    letterId: string,
    firmId: string
  ): Promise<
    | (EngagementLetter & {
        engagement: Engagement & { client: Client; firm: Firm };
      })
    | null
  >;
  markSent(letterId: string, sentAt: Date, docxPath?: string): Promise<EngagementLetter>;
  findByEngagementId(engagementId: string): Promise<EngagementLetter | null>;
  markSigned(
    letterId: string,
    input: {
      signedAt: Date;
      signedDocumentUrl: string | null;
      clientSignatoryName?: string;
    }
  ): Promise<EngagementLetter>;
}

export interface DocumentTemplateRepository {
  findActiveForFirm(firmId: string, templateId?: string): Promise<DocumentTemplate | null>;
}

export interface UserRepository {
  findDisplayName(userId: string): Promise<string>;
}
