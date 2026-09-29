import prisma from './prisma.js';

export function canManagerApproveLeave(role: string): boolean {
  return ['Manager', 'Partner', 'Admin', 'HR'].includes(role);
}

export function canFinalApproveLeave(role: string): boolean {
  return ['Partner', 'Admin', 'HR'].includes(role);
}

export type LeaveDecisionStatus = 'Manager Approved' | 'Approved' | 'Rejected';

export type LeaveDecisionResult =
  | { ok: true; leave: { id: string; status: string; type: string; days: number; userId: string } }
  | { ok: false; status: number; error: string };

/** Resolve what "Approve" from email should do for this actor and leave state. */
export function resolveEmailApproveStatus(
  role: string,
  leaveStatus: string
): LeaveDecisionStatus | null {
  if (leaveStatus === 'Pending') {
    if (canFinalApproveLeave(role)) return 'Approved';
    if (canManagerApproveLeave(role)) return 'Manager Approved';
    return null;
  }
  if (leaveStatus === 'Manager Approved' && canFinalApproveLeave(role)) return 'Approved';
  return null;
}

export async function applyLeaveDecision(input: {
  leaveId: string;
  actorId: string;
  actorRole: string;
  actorFirmId: string | null;
  status: LeaveDecisionStatus;
  rejectionReason?: string;
}): Promise<LeaveDecisionResult> {
  const leave = await prisma.leaveRequest.findUnique({ where: { id: input.leaveId } });
  if (!leave) return { ok: false, status: 404, error: 'Leave request not found' };

  const applicant = await prisma.user.findUnique({
    where: { id: leave.userId },
    select: { id: true, firmId: true },
  });
  if (!applicant || applicant.firmId !== input.actorFirmId) {
    return { ok: false, status: 404, error: 'Leave request not found' };
  }
  if (leave.userId === input.actorId) {
    return { ok: false, status: 403, error: 'You cannot approve your own leave' };
  }

  const data: Record<string, unknown> = { approverId: input.actorId };

  if (input.status === 'Manager Approved') {
    if (!canManagerApproveLeave(input.actorRole)) {
      return { ok: false, status: 403, error: 'Only Manager, HR, or above can perform this action' };
    }
    if (leave.status !== 'Pending') {
      return { ok: false, status: 400, error: `Cannot move from ${leave.status} to Manager Approved` };
    }
    data.status = 'Manager Approved';
    data.managerApprovedAt = new Date();
    data.managerApprovedBy = input.actorId;
  } else if (input.status === 'Approved') {
    if (!canFinalApproveLeave(input.actorRole)) {
      return { ok: false, status: 403, error: 'Only Partner, Admin, or HR can grant final approval' };
    }
    if (leave.status !== 'Manager Approved' && leave.status !== 'Pending') {
      return { ok: false, status: 400, error: `Cannot approve a leave that is ${leave.status}` };
    }
    data.status = 'Approved';
    data.partnerApprovedAt = new Date();
    data.partnerApprovedBy = input.actorId;

    const counterUpdate: Record<string, unknown> = {};
    if (leave.type === 'Exam') counterUpdate.examLeaveUsed = { increment: leave.days };
    else if (leave.type === 'Casual') counterUpdate.casualLeaveUsed = { increment: leave.days };
    else if (leave.type === 'Sick') counterUpdate.sickLeaveUsed = { increment: leave.days };

    if (Object.keys(counterUpdate).length > 0) {
      await prisma.articleshipRecord
        .update({ where: { userId: leave.userId }, data: counterUpdate })
        .catch(() => null);
    }
  } else {
    if (!canManagerApproveLeave(input.actorRole)) {
      return { ok: false, status: 403, error: 'Only Manager, HR, or above can reject' };
    }
    if (leave.status === 'Approved' || leave.status === 'Rejected') {
      return { ok: false, status: 400, error: `Leave is already ${leave.status}` };
    }
    data.status = 'Rejected';
    data.rejectedAt = new Date();
    data.rejectedBy = input.actorId;
    data.rejectionReason = input.rejectionReason;
  }

  const updated = await prisma.leaveRequest.update({ where: { id: leave.id }, data });

  const notifTitle =
    updated.status === 'Approved'
      ? 'Leave sanctioned'
      : updated.status === 'Rejected'
        ? 'Leave rejected'
        : 'Leave updated';
  const notifMessage =
    updated.status === 'Approved'
      ? `Your ${leave.type} leave (${leave.days} day${leave.days > 1 ? 's' : ''}) has been sanctioned.`
      : updated.status === 'Rejected'
        ? `Your ${leave.type} leave (${leave.days} day${leave.days > 1 ? 's' : ''}) was rejected.`
        : `Your ${leave.type} leave (${leave.days} day${leave.days > 1 ? 's' : ''}) was updated to ${updated.status}.`;

  await prisma.notification.create({
    data: {
      userId: leave.userId,
      title: notifTitle,
      message: notifMessage,
      type: updated.status === 'Approved' ? 'success' : updated.status === 'Rejected' ? 'danger' : 'info',
    },
  });

  return {
    ok: true,
    leave: {
      id: updated.id,
      status: updated.status,
      type: leave.type,
      days: leave.days,
      userId: leave.userId,
    },
  };
}
