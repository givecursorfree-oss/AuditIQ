process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://u:p@localhost:3306/auditiq';

async function main() {
  const { leaveRequestDays } = await import('./leaveRequestDays.js');
  const full = leaveRequestDays('2026-10-05', '2026-10-07', false);
  if (!('days' in full) || full.days !== 3) throw new Error('span');
  const half = leaveRequestDays('2026-10-05', '2026-10-05', true);
  if (!('days' in half) || half.days !== 0.5) throw new Error('half');
  const bad = leaveRequestDays('2026-10-05', '2026-10-06', true);
  if (!('error' in bad)) throw new Error('half range');
  console.log('leaveRequestDays.selfcheck: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
