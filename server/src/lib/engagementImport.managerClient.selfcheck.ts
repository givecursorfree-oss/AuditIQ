process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://u:p@localhost:3306/auditiq';

async function main() {
  const { managerMayImportExistingClient } = await import('./engagementImport.js');

  if (
    !managerMayImportExistingClient({
      managerClientIds: null,
      clientId: 'c1',
      actorId: 'm1',
      rowManagerId: null,
    })
  ) {
    throw new Error('non-manager must pass');
  }

  if (
    !managerMayImportExistingClient({
      managerClientIds: new Set(['c1']),
      clientId: 'c1',
      actorId: 'm1',
      rowManagerId: null,
    })
  ) {
    throw new Error('assigned client must pass');
  }

  if (
    !managerMayImportExistingClient({
      managerClientIds: new Set(),
      clientId: 'c1',
      actorId: 'm1',
      rowManagerId: 'm1',
    })
  ) {
    throw new Error('named row manager must pass');
  }

  if (
    managerMayImportExistingClient({
      managerClientIds: new Set(),
      clientId: 'c1',
      actorId: 'm1',
      rowManagerId: 'other',
    })
  ) {
    throw new Error('unassigned other-manager row must fail');
  }

  console.log('engagementImport.managerClient.selfcheck: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
