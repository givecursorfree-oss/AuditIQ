import {
  Users,
  Shield,
  Buildings as Building2,
  PencilSimple as Edit2,
  FileText,
  DownloadSimple as Download,
  Eye,
  EnvelopeSimple as Mail,
} from '@phosphor-icons/react';

export const MODULE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  dashboard: { label: 'Dashboard', icon: Eye },
  engagements: { label: 'Engagements', icon: FileText },
  workpapers: { label: 'Workpapers', icon: Edit2 },
  documents: { label: 'Documents', icon: FileText },
  reports: { label: 'Reports', icon: Download },
  attendance: { label: 'Attendance', icon: Users },
  leave: { label: 'Leave (apply / manage)', icon: Users },
  employees: { label: 'Employees', icon: Users },
  messages: { label: 'Messages', icon: Mail },
  settings: { label: 'Settings', icon: Shield },
  clients: { label: 'Clients', icon: Building2 },
  invoices: { label: 'Billing & Invoices', icon: Download },
  vault: { label: 'Password Vault', icon: Shield },
  approvals: { label: 'Approvals', icon: Shield },
  expenses: { label: 'Claims / Expenses', icon: Download },
};

export const ACTION_LABELS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
  export: 'Export',
};
