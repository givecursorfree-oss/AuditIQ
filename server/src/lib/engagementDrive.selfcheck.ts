/**
 * Run: npx --yes tsx src/lib/engagementDrive.selfcheck.ts
 * Pure checks for Shared Drive folder-link rules (no Google / DB).
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** My Drive folders have no driveId — must reject for Shared Drive model. */
function isSharedDriveFolder(meta: { mimeType: string; driveId?: string | null }): boolean {
  return meta.mimeType === 'application/vnd.google-apps.folder' && Boolean(meta.driveId);
}

assert(
  isSharedDriveFolder({
    mimeType: 'application/vnd.google-apps.folder',
    driveId: '0ABcdSharedDrive',
  }),
  'shared drive folder ok'
);
assert(
  !isSharedDriveFolder({
    mimeType: 'application/vnd.google-apps.folder',
    driveId: null,
  }),
  'my drive folder rejected'
);
assert(
  !isSharedDriveFolder({
    mimeType: 'application/pdf',
    driveId: '0ABcdSharedDrive',
  }),
  'file rejected'
);

/** First link becomes primary when none exists. */
function shouldBePrimary(opts: { isPrimary?: boolean; existingCount: number }): boolean {
  return opts.isPrimary === true || (opts.existingCount === 0 && opts.isPrimary !== false);
}

assert(shouldBePrimary({ existingCount: 0 }), 'first link primary');
assert(shouldBePrimary({ existingCount: 0, isPrimary: true }), 'explicit primary');
assert(!shouldBePrimary({ existingCount: 0, isPrimary: false }), 'first can skip primary');
assert(!shouldBePrimary({ existingCount: 2 }), 'extra defaults non-primary');
assert(shouldBePrimary({ existingCount: 2, isPrimary: true }), 'promote primary');

console.log('engagementDrive.selfcheck: ok');
