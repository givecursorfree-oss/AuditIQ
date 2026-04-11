// ─── User & Auth ───
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  initials: string;
  role: string;
  roleId?: string;
  roleRef?: { id: string; name: string };
  designation?: string;
  phone?: string;
  avatar?: string;
  firmId: string;
  isActive: boolean;
  createdAt?: string;
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

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  firmName?: string;
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
export type EngagementStatus = 'Planning' | 'Fieldwork' | 'Review' | 'Completed' | 'Archived';

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
  engagementId: string;
  uploadedBy?: Pick<User, 'firstName' | 'lastName' | 'initials'>;
  createdAt: string;
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

// ─── Copilot ───
export interface CopilotSession {
  id: string;
  title: string;
  engagementId?: string;
  messageCount?: number;
  _count?: { messages: number };
  updatedAt: string;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sessionId?: string;
  createdAt: string;
}

// ─── Deadline ───
export interface Deadline {
  id: string;
  title: string;
  dueDate: string;
  type: string;
  completed: boolean;
  isOverdue?: boolean;
  daysRemaining?: number;
  engagement?: {
    title: string;
    client?: { name: string };
  };
}
