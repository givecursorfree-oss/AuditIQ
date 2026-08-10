/** MKD Workflow of Engagements — dashboard types */

export type PipelineStage =
  | 'data_request'
  | 'article_task'
  | 'manager_review'
  | 'partner_review'
  | 'client_review'
  | 'filing'
  | 'documentation'
  | 'billing';

export type EngagementWorkflowStatus =
  | 'not_started'
  | 'in_progress'
  | 'pending_review'
  | 'filed'
  | 'completed';

export type EngagementCategory = 'direct_tax' | 'indirect_tax';

export interface WorkflowStepView {
  code: string;
  label: string;
}

export interface WorkflowEngagement {
  id: string;
  name: string;
  category: EngagementCategory;
  serviceCode: string | null;
  dueDate: string | null;
  frequency: string;
  clientId: string;
  clientName: string;
  assignedToId: string | null;
  assignedToName: string | null;
  partnerInChargeId: string | null;
  managerId: string | null;
  articleAssistantId: string | null;
  partnerInChargeName: string | null;
  managerName: string | null;
  articleAssistantName: string | null;
  currentStageCode: string;
  currentStageLabel: string;
  completedStageCodes: string[];
  steps: WorkflowStepView[];
  status: EngagementWorkflowStatus;
  financialYear: string;
  dataRequestPercent?: number;
  daysRemaining: number | null;
  rag: 'red' | 'amber' | 'green' | 'gray';
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  letterStatus?: string;
}

export interface ServiceTemplate {
  code: string;
  name: string;
  domain: 'DT' | 'IDT';
  dueRule: string;
  recurrence?: string;
  steps: WorkflowStepView[];
}

export interface WorkflowTeamMember {
  id: string;
  name: string;
  role: string;
  designation?: string | null;
  hierarchyLevelCode?: string | null;
}

export type EngagementResourceField = 'partnerInChargeId' | 'managerId' | 'articleAssistantId';

export interface HierarchyRole {
  id: string;
  title: string;
  level: number;
  parentId?: string;
  isSupport: boolean;
  memberCount?: number;
  code?: string;
}

export interface ComplianceCalendarEvent {
  date: string;
  serviceCode: string;
  serviceName: string;
  domain: 'DT' | 'IDT';
  engagementIds: string[];
}
