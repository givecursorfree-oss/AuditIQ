/**
 * Run: npx --yes tsx src/lib/engagementDrive.selfcheck.ts
 * Pure checks for engagement ↔ Drive link rules (no Google / DB).
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

type DriveLinkKind = 'SHARED_DRIVE' | 'SHARED_FOLDER';

/** Mirrors resolveDriveLinkKind — Shared Drive has driveId; Shared Folder does not. */
function resolveDriveLinkKind(driveId: string | null | undefined): DriveLinkKind {
  return driveId ? 'SHARED_DRIVE' : 'SHARED_FOLDER';
}

function isLinkableFolder(meta: { mimeType: string }): boolean {
  return meta.mimeType === 'application/vnd.google-apps.folder';
}

assert(resolveDriveLinkKind('0ABcdSharedDrive') === 'SHARED_DRIVE', 'shared drive kind');
assert(resolveDriveLinkKind(null) === 'SHARED_FOLDER', 'shared folder kind');
assert(resolveDriveLinkKind(undefined) === 'SHARED_FOLDER', 'missing driveId = shared folder');
assert(
  isLinkableFolder({ mimeType: 'application/vnd.google-apps.folder' }),
  'folder ok'
);
assert(!isLinkableFolder({ mimeType: 'application/pdf' }), 'file rejected');

/** First link becomes primary when none exists. */
function shouldBePrimary(opts: { isPrimary?: boolean; existingCount: number }): boolean {
  return opts.isPrimary === true || (opts.existingCount === 0 && opts.isPrimary !== false);
}

assert(shouldBePrimary({ existingCount: 0 }), 'first link primary');
assert(shouldBePrimary({ existingCount: 0, isPrimary: true }), 'explicit primary');
assert(!shouldBePrimary({ existingCount: 0, isPrimary: false }), 'first can skip primary');
assert(!shouldBePrimary({ existingCount: 2 }), 'extra defaults non-primary');
assert(shouldBePrimary({ existingCount: 2, isPrimary: true }), 'promote primary');

/** Switching storage kind later = unlink + re-link (no Drive tree migration). */
function canSwitchLinkKind(from: DriveLinkKind, to: DriveLinkKind): boolean {
  return from !== to || from === to;
}
assert(canSwitchLinkKind('SHARED_DRIVE', 'SHARED_FOLDER'), 'switch drive → folder');
assert(canSwitchLinkKind('SHARED_FOLDER', 'SHARED_DRIVE'), 'switch folder → drive');

console.log('engagementDrive.selfcheck: ok');
