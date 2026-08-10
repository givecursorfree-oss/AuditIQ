export interface ClientProfile {
  clientId: string;
  clientName: string;
  legalName?: string | null;
  firmName?: string;
  contactName?: string | null;
}

export interface ClientEngagement {
  id: string;
  name: string;
  type: string;
  status: string;
  currentStage: string;
  workflowDomain?: 'DT' | 'IDT' | 'AUDIT';
  serviceCode?: string;
  stageDescription?: string;
  assessmentYear: string;
  referenceNo?: string;
  submittedAt?: string;
  startDate: string | null;
  endDate: string | null;
  deadline: string | null;
  progress: number;
  progressStep?: number;
  progressSteps?: string[];
  documentCount: number;
  pendingDocuments?: number;
  isActivated?: boolean;
  needsClientAction?: boolean;
  partnerInCharge?: { name: string; designation: string } | null;
}

export interface ClientDocument {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  size: number;
  engagementId: string;
  engagementName: string;
}

export interface DocRequest {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  engagementId: string;
  engagementName: string;
  createdAt: string;
}

export interface TimelineStage {
  id: string;
  stage: string;
  status: 'completed' | 'active' | 'pending';
  timestamp: string | null;
  description?: string;
  actor?: string;
}

export interface ChecklistItem {
  id: string;
  title: string;
  status: string;
  requestedAt: string;
  receivedAt: string | null;
  revisionNotes?: string | null;
  revisionRequestedAt?: string | null;
}

export interface EngagementDetail {
  id: string;
  name: string;
  type: string;
  financialYear: string;
  referenceNo: string;
  submittedAt: string;
  currentStage: string;
  stageDescription: string;
  status: string;
  isActivated: boolean;
  needsClientAction: boolean;
  pendingDocuments: number;
  scope: string | null;
  deadline: string | null;
  partnerInCharge: { name: string; designation: string } | null;
  checklist: ChecklistItem[];
  invoices: { id: string; number: string; amount: number; status: string; dueDate: string | null; issueDate: string }[];
  sharedReports: {
    id: string;
    title: string;
    type: string;
    status: string;
    sharedAt: string | null;
    acknowledgedAt?: string | null;
    clientQuery?: string | null;
    clientQueryAt?: string | null;
  }[];
}

export interface ClientInvoice {
  id: string;
  number: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: string;
  dueDate: string;
  issueDate: string;
  engagementId: string | null;
  engagementName: string | null;
}

export interface ClientReport {
  id: string;
  title: string;
  type: string;
  status: string;
  sharedAt: string | null;
  acknowledgedAt: string | null;
  clientQuery: string | null;
  clientQueryAt: string | null;
  engagementId: string;
  engagementName: string;
}

export interface AuditQueryRow {
  id: string;
  subject: string;
  body: string;
  status: string;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  engagementId: string;
  engagementName: string;
}

export interface ClientPreferences {
  notifyStageChanges: boolean;
  notifyDocumentRequests: boolean;
  notifyInvoices: boolean;
}

export interface ServiceRequestRow {
  id: string;
  status: string;
  selectedServices: string[];
  financialYears: string[];
  serviceLabels?: string[];
  notes?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  engagement?: {
    id: string;
    title: string;
    letterStatus: string;
    serviceCode?: string | null;
  } | null;
}

export interface PendingLetter {
  id: string;
  engagement: { id: string; title: string; financialYear: string };
  sentAt?: string | null;
}

export interface LetterInPreparation {
  id: string;
  title: string;
  financialYear: string;
  engagementLetter?: { id: string; status: string } | null;
}

export interface EngagementRequestForm {
  selectedServices: string[];
  financialYear: string;
  customYear: string;
  notes: string;
}

export interface NewAuditQuery {
  engagementId: string;
  subject: string;
  body: string;
}
