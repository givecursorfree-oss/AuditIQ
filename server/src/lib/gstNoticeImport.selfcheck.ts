process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://u:p@localhost:3306/auditiq';

async function main() {
  const { parseDueDate, autoStatusLabel, normalizeGstin, portalFieldChanged } = await import(
    './gstNoticeImport.js'
  );

  const na = parseDueDate('NA');
  if (na.dueKind !== 'not_applicable') throw new Error('NA');
  const aa = parseDueDate('As Applicable*');
  if (aa.dueKind !== 'unclear') throw new Error('As Applicable');
  const blank = parseDueDate('');
  if (blank.dueKind !== 'unclear') throw new Error('blank');
  const dash = parseDueDate('—');
  if (dash.dueKind !== 'unclear') throw new Error('dash');

  if (normalizeGstin('33AABCM1234A1Z5') !== '33AABCM1234A1Z5') throw new Error('gstin');
  if (normalizeGstin('bad') !== null) throw new Error('bad gstin');

  if (portalFieldChanged('a', null)) throw new Error('blank must not erase');
  if (!portalFieldChanged('a', 'b')) throw new Error('change');

  const overdue = autoStatusLabel('date', new Date(Date.UTC(2020, 0, 1)), new Date(2026, 9, 15));
  if (!/^Overdue/.test(overdue)) throw new Error('overdue');
  if (autoStatusLabel('not_applicable', null) !== 'Not applicable') throw new Error('n/a label');

  console.log('gstNoticeImport.selfcheck: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
