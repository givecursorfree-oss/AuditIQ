process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://u:p@localhost:3306/auditiq';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

async function main() {
  const { resolveEmailApproveStatus } = await import('./leaveDecision.js');
  const {
    leaveMailActionButtonsHtml,
    signLeaveMailToken,
    verifyLeaveMailToken,
  } = await import('./leaveMailAction.js');

  const token = signLeaveMailToken({ leaveId: 'leave-1', userId: 'user-1', action: 'approve' });
  const parsed = verifyLeaveMailToken(token);
  if (parsed?.leaveId !== 'leave-1' || parsed?.userId !== 'user-1' || parsed?.action !== 'approve') {
    throw new Error('token round-trip failed');
  }
  if (verifyLeaveMailToken('bogus') !== null) throw new Error('bogus token should fail');

  if (resolveEmailApproveStatus('Manager', 'Pending') !== 'Manager Approved') throw new Error('mgr');
  if (resolveEmailApproveStatus('Partner', 'Pending') !== 'Approved') throw new Error('partner');
  if (resolveEmailApproveStatus('Partner', 'Manager Approved') !== 'Approved') throw new Error('partner2');
  if (resolveEmailApproveStatus('Manager', 'Manager Approved') !== null) throw new Error('mgr blocked');
  if (resolveEmailApproveStatus('Staff', 'Pending') !== null) throw new Error('staff');

  const html = leaveMailActionButtonsHtml({ leaveId: 'leave-1', userId: 'user-1' });
  if (!html.includes('>Open<') || !html.includes('>Approve<') || !html.includes('>Reject<')) {
    throw new Error('buttons missing');
  }
  if (!html.includes('/api/leave-mail/action?token=')) throw new Error('action url missing');

  const openOnly = leaveMailActionButtonsHtml({ leaveId: 'leave-1', userId: 'user-1', includeDecide: false });
  if (!openOnly.includes('>Open<') || openOnly.includes('>Approve<')) throw new Error('open-only');

  console.log('leaveMailAction.selfcheck: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
