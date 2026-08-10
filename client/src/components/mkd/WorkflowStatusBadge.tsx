import { Badge } from '@/components/ui/badge';
import {
  formatLetterStatus,
  formatRequestStatus,
  letterStatusBadgeVariant,
  requestStatusBadgeVariant,
  resolveLetterWorkflowDisplay,
  dashboardEngagementRowDisplay,
  engagementLifecycleBadgeVariant,
  approvalStatusBadgeVariant,
  workflowApprovalStatusBadgeVariant,
  priorityBadgeVariant,
  formatEngagementStatus,
  formatApprovalStatus,
  formatWorkflowApprovalStatus,
  formatPriority,
  type DashboardEngagementRowStatus,
  type LetterWorkflowContext,
  type StatusBadgeVariant,
} from '@/lib/engagementStatus';

type WorkflowStatusBadgeProps = {
  className?: string;
  variant?: StatusBadgeVariant;
  label: string;
};

function WorkflowStatusBadge({ className, variant = 'secondary', label }: WorkflowStatusBadgeProps) {
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}

export function RequestStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <WorkflowStatusBadge
      className={className}
      variant={requestStatusBadgeVariant(status)}
      label={formatRequestStatus(status)}
    />
  );
}

export function LetterStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <WorkflowStatusBadge
      className={className}
      variant={letterStatusBadgeVariant(status)}
      label={formatLetterStatus(status)}
    />
  );
}

export function LetterWorkflowStatusBadge({
  context,
  className,
}: {
  context: LetterWorkflowContext;
  className?: string;
}) {
  const { label, badgeVariant } = resolveLetterWorkflowDisplay(context);
  return <WorkflowStatusBadge className={className} variant={badgeVariant} label={label} />;
}

export function DashboardEngagementStatusBadge({
  status,
  className,
}: {
  status: DashboardEngagementRowStatus;
  className?: string;
}) {
  const { label, badgeVariant } = dashboardEngagementRowDisplay(status);
  return <WorkflowStatusBadge className={className} variant={badgeVariant} label={label} />;
}

export function EngagementLifecycleBadge({ status, className }: { status: string; className?: string }) {
  return (
    <WorkflowStatusBadge
      className={className}
      variant={engagementLifecycleBadgeVariant(status)}
      label={formatEngagementStatus(status)}
    />
  );
}

export function ApprovalStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <WorkflowStatusBadge
      className={className}
      variant={approvalStatusBadgeVariant(status)}
      label={formatApprovalStatus(status)}
    />
  );
}

export function WorkflowApprovalStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <WorkflowStatusBadge
      className={className}
      variant={workflowApprovalStatusBadgeVariant(status)}
      label={formatWorkflowApprovalStatus(status)}
    />
  );
}

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  return (
    <WorkflowStatusBadge
      className={className}
      variant={priorityBadgeVariant(priority)}
      label={formatPriority(priority)}
    />
  );
}
