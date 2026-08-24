// ─── User & Auth ───
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  initials: string;
  role: 'Partner' | 'Admin' | 'Manager' | 'Staff' | 'Intern' | 'Client';
  roleId?: string;
  roleRef?: { id: string; name: string };
  designation?: string;
  hierarchyLevel?: { id: string; code: string; title: string } | null;
  phone?: string;
  avatar?: string;
  firmId: string;
  firm?: { id: string; name: string };
  isActive: boolean;
  presenceStatus?: 'online' | 'offline';
  presenceUpdatedAt?: string;
  twoFactorEnabled?: boolean;
  createdAt?: string;
  /** `module:action` keys from RBAC; `*` for Admin/Partner */
  permissions?: string[];
}

// ─── RBAC: Roles & Permissions ───
export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
  permissions: PermissionItem[];
  createdAt?: string;
}

export interface PermissionItem {
  id: string;
  module: string;
  action: string;
  description?: string;
}

export interface Firm {
  id: string;
  name: string;
  registrationNo?: string;
  pan?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  website?: string;
}



// ─── Client (Audit Client Entity) ───
export interface Client {
  id: string;
  name: string;
  code: string;
  entityType: string;
  cin?: string;
  pan: string;
  gstin?: string;
  industry?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  isActive: boolean;
  createdAt: string;
  engagements?: Engagement[];
}

// ─── Engagement ───
export type EngagementType = 'Statutory' | 'Tax (44AB)' | 'GST' | 'Internal' | 'Special';
export type EngagementStatus = 'Planning' | 'Fieldwork' | 'Under Review' | 'Reporting' | 'Closed';

export interface Engagement {
  id: string;
  title: string;
  type: EngagementType;
  status: EngagementStatus;
  financialYear: string;
  startDate: string;
  deadline?: string;
  billingType?: string;
  billingAmount?: number;
  scope?: string;
  progress?: number;
  currentStage?: string;
  workflowDomain?: 'DT' | 'IDT' | 'AUDIT';
  serviceCode?: string;
  isRecurring?: boolean;
  letterStatus?: string;
  clientId: string;
  client?: Client;
  members?: EngagementMember[];
  _count?: {
    workpapers: number;
    documents: number;
    observations: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface EngagementMember {
  id: string;
  userId: string;
  engagementId: string;
  role: string;
  user?: Pick<User, 'firstName' | 'lastName' | 'initials'>;
}

// ─── Workpaper ───
export type WorkpaperStatus = 'Draft' | 'Prepared' | 'Under Review' | 'Reviewed' | 'Approved' | 'Needs Revision';

export interface Workpaper {
  id: string;
  title: string;
  reference: string;
  type: string;
  section?: string;
  status: WorkpaperStatus;
  content?: string;
  conclusion?: string;
  engagementId: string;
  preparedById: string;
  preparedBy?: Pick<User, 'firstName' | 'lastName' | 'initials'>;
  auditSteps?: AuditStep[];
  reviewComments?: ReviewComment[];
  signoffs?: SignOff[];
  _count?: { auditSteps: number; reviewComments: number; signoffs: number };
  createdAt: string;
  updatedAt: string;
}

export interface AuditStep {
  id: string;
  stepNumber: number;
  description: string;
  assertion?: string;
  procedure?: string;
  result?: string;
  notes?: string;
  isCompleted: boolean;
}

export interface ReviewComment {
  id: string;
  content: string;
  severity: string;
  isResolved: boolean;
  authorId: string;
  author?: Pick<User, 'firstName' | 'lastName' | 'initials'>;
  createdAt: string;
}

export interface SignOff {
  id: string;
  type: string;
  status: string;
  userId: string;
  user?: Pick<User, 'firstName' | 'lastName'>;
  signedAt: string;
  comments?: string;
}

// ─── Document ───
export interface Document {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  folder: string;
  version: number;
  engagementId?: string;
  parentId?: string;
  source?: 'UPLOAD' | 'GOOGLE_DRIVE';
  visibility?: 'ENGAGEMENT' | 'FIRM';
  indexStatus?: 'PENDING' | 'INDEXED' | 'FAILED' | 'SKIPPED';
  uploadedBy?: Pick<User, 'firstName' | 'lastName' | 'initials'>;
  createdAt: string;
}

export interface DocumentSearchHit {
  id: string;
  title: string;
  subtitle: string;
  highlight?: string;
  visibility?: string;
  source?: string;
  engagementId?: string;
}

export interface SyncFolder {
  id: string;
  name: string;
}

export interface GoogleDriveStatus {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  folderIds: string[];
  folders?: SyncFolder[];
  defaultEngagementId: string | null;
  lastSyncAt: string | null;
}

// ─── Observation (ICAI format) ───
export interface Observation {
  id: string;
  title: string;
  criteria: string;
  condition: string;
  cause: string;
  effect: string;
  recommendation: string;
  managementResponse?: string;
  severity: string;
  status: string;
  saReference?: string;
  engagementId?: string;
  reportedBy?: Pick<User, 'firstName' | 'lastName' | 'initials'>;
  createdAt: string;
}

// ─── Report ───
export interface Report {
  id: string;
  title: string;
  type: string;
  content: string;
  status: string;
  version?: number;
  engagementId: string;
  engagement?: { title: string; client?: { name: string } };
  generatedBy?: Pick<User, 'firstName' | 'lastName'>;
  createdAt: string;
}

// ─── Attendance ───
export interface Attendance {
  id: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  hoursWorked?: number;
  status: string;
  method: string;
  location?: string;
  lateBand?: string | null;
  clientName?: string | null;
  bioPresent?: boolean | null;
  forgiven?: boolean;
  isArticle?: boolean;
  user?: Pick<User, 'firstName' | 'lastName' | 'initials' | 'email'>;
  office?: { name: string };
}

export interface LeaveRequest {
  id: string;
  fromDate: string;
  toDate: string;
  type: string;
  reason?: string;
  status: string;
  user?: Pick<User, 'firstName' | 'lastName' | 'initials'>;
  approver?: Pick<User, 'firstName' | 'lastName'>;
  createdAt: string;
}

// ─── Notification ───
export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

// ─── Deadline ───
export interface Deadline {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  status: string;
  type: string;
  completed: boolean;
  engagementId: string;
  engagement?: { title: string; client?: { name: string } };
  isOverdue?: boolean;
  daysRemaining?: number;
}

// ─── Dashboard ───
export interface DashboardStats {
  totalClients: number;
  totalEngagements: number;
  activeEngagements: number;
  overdueDeadlines: number;
  teamMembers: number;
  monthlyHours: number;
  openClientQueries?: number;
}

export interface DashboardData {
  stats: DashboardStats;
  engagementsByStatus: Record<string, number>;
  engagementsByType: Record<string, number>;
  activeEngagements: Engagement[];
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  user: Pick<User, 'firstName' | 'lastName' | 'initials'>;
  createdAt: string;
}

// ─── Audit Log ───
export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  userId: string;
  user?: Pick<User, 'firstName' | 'lastName' | 'initials'>;
  createdAt: string;
}

// ─── Time Entry ───
export interface TimeEntry {
  id: string;
  date: string;
  hours: number;
  description?: string;
  isBillable: boolean;
  engagementId: string;
  engagement?: { title: string; client?: { name: string } };
  userId: string;
  user?: Pick<User, 'firstName' | 'lastName' | 'initials'>;
  createdAt: string;
}

// ─── Form 3CD ───
export interface Form3CDClause {
  id: string;
  clauseNumber: number;
  clauseTitle: string;
  response?: string;
  remarks?: string;
  isApplicable: boolean;
  isCompleted: boolean;
  reportId: string;
}

// ─── Document Request ───
export interface DocumentRequest {
  id: string;
  title: string;
  description?: string;
  status: string;
  dueDate?: string;
  clientNotes?: string;
  engagementId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Workload Summary ───
export interface WorkloadSummary {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  role: string;
  designation?: string;
  activeEngagements: number;
  stageDistribution: Record<string, number>;
  upcomingDeadlines: number;
  billableHoursThisWeek: number;
  availability: 'Available' | 'Engaged' | 'On Leave';
  highWorkload: boolean;
  isOnLeave: boolean;
}

// ─── Admin Briefing ───
export interface AdminBriefing {
  engagementsAtRisk: { id: string; title: string; currentStage: string; deadline: string; client: { name: string } }[];
  pendingDocuments: { id: string; title: string; engagement: { id: string; title: string; client: { name: string } } }[];
  inactiveEmployees: { id: string; firstName: string; lastName: string; role: string }[];
  udinPending: { id: string; title: string; client: { name: string } }[];
  uninvoicedClosures: { id: string; title: string; client: { name: string } }[];
  summary: {
    atRiskCount: number;
    pendingDocsCount: number;
    inactiveCount: number;
    udinPendingCount: number;
    uninvoicedCount: number;
  };
}

// ─── Stage Gate Check ───
export interface StageGateCheck {
  allowed: boolean;
  blockers: string[];
  currentStage: string;
  toStage: string;
}
