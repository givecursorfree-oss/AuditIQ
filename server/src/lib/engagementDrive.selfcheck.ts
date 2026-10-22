/**
 * Run: npx --yes tsx src/lib/engagementDrive.selfcheck.ts
 * Pure checks for Shared Drive folder-link rules (no Google / DB).
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** Mirrors parseGoogleDriveFolderId in driveSync.ts — keep in sync. */
function parseFolderRef(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s) && !s.includes('/')) return s;
  const fromFolders = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (fromFolders?.[1]) return fromFolders[1];
  const fromId = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fromId?.[1]) return fromId[1];
  return null;
}

assert(
  parseFolderRef('https://drive.google.com/drive/u/0/folders/0ABC_SharedDriveFolder') ===
    '0ABC_SharedDriveFolder',
  'folder url parse'
);
assert(parseFolderRef('0ABC_SharedDriveFolder') === '0ABC_SharedDriveFolder', 'raw id');
assert(parseFolderRef('nope') === null, 'reject junk');

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
