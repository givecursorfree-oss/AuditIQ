import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import prisma from './prisma.js';
import { getEnv } from './env.js';
import logger from './logger.js';
import { decryptSecret, encryptSecret } from './vaultCrypto.js';
import { enqueueDocumentIndex, removeDocumentFromIndex } from './documentIndexer.js';

export type SyncFolder = { id: string; name: string };

export type DriveSyncResult = {
  synced: number;
  skipped: number;
  removed: number;
  errors: string[];
};

/** Parse folderIds JSON — supports legacy string[] or { id, name }[]. */
export function parseSyncFolders(raw: string | null | undefined): SyncFolder[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    if (parsed.length === 0) return [];
    if (typeof parsed[0] === 'string') {
      return (parsed as string[]).map((id) => ({ id, name: id }));
    }
    return (parsed as SyncFolder[])
      .filter((f) => f && typeof f.id === 'string')
      .map((f) => ({ id: f.id, name: f.name || f.id }));
  } catch {
    return [];
  }
}

export function serializeSyncFolders(folders: SyncFolder[]): string {
  return JSON.stringify(folders);
}

const activeSyncs = new Set<string>();

const EXPORTABLE_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export function isGoogleDriveOAuthConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

function getOAuthClient() {
  if (!isGoogleDriveOAuthConfigured()) {
    throw new Error(
      'Google Drive OAuth is not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI on the API host, then recreate the server container'
    );
  }
  const env = getEnv();
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID!,
    env.GOOGLE_CLIENT_SECRET!,
    env.GOOGLE_REDIRECT_URI!
  );
}

/** Map Drive/OAuth failures to HTTP-friendly client messages. */
export function mapDriveApiError(err: unknown): { status: number; error: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('oauth is not configured') || lower.includes('google drive oauth is not configured')) {
    return {
      status: 503,
      error:
        'Google Drive OAuth credentials missing on the API server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env.kvm2 (or .env.api), then recreate the server container.',
    };
  }
  if (lower.includes('not connected') || lower.includes('connection not found')) {
    return { status: 404, error: 'Google Drive not connected. Connect from Drive workspace first.' };
  }
  if (
    lower.includes('invalid_grant') ||
    lower.includes('invalid_rapt') ||
    lower.includes('token has been expired') ||
    lower.includes('token has been revoked')
  ) {
    return {
      status: 401,
      error: 'Google authorization expired. Disconnect Google Drive and connect again.',
    };
  }
  if (lower.includes('insufficient') || lower.includes('access_denied') || lower.includes('forbidden')) {
    return {
      status: 403,
      error:
        'This Google account cannot access Shared Drives with the current grant. Disconnect, reconnect, and ensure the account is a Shared Drive member.',
    };
  }
  if (lower.includes('shared drive') || lower.includes('not a folder') || lower.includes('not found')) {
    return { status: 400, error: msg };
  }
  return { status: 500, error: msg || 'Google Drive request failed' };
}

/** Accept a Drive folder URL or raw folder id. */
export function parseGoogleDriveFolderId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s) && !s.includes('/')) return s;
  const fromFolders = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (fromFolders?.[1]) return fromFolders[1];
  const fromId = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fromId?.[1]) return fromId[1];
  return null;
}

async function getDriveClient(connectionId: string) {
  const conn = await prisma.googleDriveConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn || !conn.isActive) throw new Error('Drive connection not found');

  const oauth2 = getOAuthClient();
  const refreshToken = decryptSecret(conn.encryptedRefreshToken);
  oauth2.setCredentials({
    refresh_token: refreshToken,
    access_token: conn.encryptedAccessToken
      ? decryptSecret(conn.encryptedAccessToken)
      : undefined,
  });

  oauth2.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.googleDriveConnection.update({
        where: { id: connectionId },
        data: {
          encryptedAccessToken: encryptSecret(tokens.access_token),
          accessTokenExpiresAt: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : null,
        },
      });
    }
  });

  const drive = google.drive({ version: 'v3', auth: oauth2 });
  return { drive, conn };
}

async function downloadDriveFile(
  drive: ReturnType<typeof google.drive>,
  fileId: string,
  mimeType: string,
  uploadDir: string
): Promise<{ localPath: string; mimeType: string; size: number }> {
  const isGoogleDoc = mimeType.startsWith('application/vnd.google-apps.');
  let exportMime = mimeType;
  let ext = '';

  if (isGoogleDoc) {
    if (mimeType.includes('document')) {
      exportMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      ext = '.docx';
    } else if (mimeType.includes('spreadsheet')) {
      exportMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      ext = '.xlsx';
    } else if (mimeType.includes('presentation')) {
      exportMime = 'application/pdf';
      ext = '.pdf';
    } else {
      throw new Error('Unsupported Google Workspace type');
    }
  } else {
    const map: Record<string, string> = {
      'application/pdf': '.pdf',
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'text/plain': '.txt',
    };
    ext = map[mimeType] || path.extname(fileId) || '';
  }

  const localName = `${Date.now()}-${fileId}${ext}`;
  const localPath = path.join(uploadDir, localName);

  if (isGoogleDoc) {
    const res = await drive.files.export(
      { fileId, mimeType: exportMime },
      { responseType: 'stream' }
    );
    await streamToFile(res.data as NodeJS.ReadableStream, localPath);
  } else {
    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );
    await streamToFile(res.data as NodeJS.ReadableStream, localPath);
  }

  const stat = fs.statSync(localPath);
  return { localPath, mimeType: exportMime, size: stat.size };
}

function streamToFile(stream: NodeJS.ReadableStream, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    stream.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

async function listFilesInFolder(
  drive: ReturnType<typeof google.drive>,
  folderId: string
): Promise<Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; size?: string }>> {
  const files: Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; size?: string }> = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
      pageSize: 100,
      pageToken,
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name || !f.mimeType) continue;
      if (f.mimeType === GOOGLE_FOLDER_MIME) {
        const nested = await listFilesInFolder(drive, f.id);
        files.push(...nested);
      } else {
        files.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          modifiedTime: f.modifiedTime ?? undefined,
          size: f.size ?? undefined,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

export type DriveBrowseItem = {
  id: string;
  name: string;
  mimeType: string;
  kind: 'folder' | 'file';
};

export type SharedDriveItem = { id: string; name: string };

/** Virtual browse parent: lists Workspace Shared Drives the connected user can see. */
export const SHARED_DRIVES_ROOT = 'shared-drives-root';

/** List Shared Drives (Team Drives) for the connected Google account — probe only. */
export async function listSharedDrives(userId: string): Promise<SharedDriveItem[]> {
  const conn = await prisma.googleDriveConnection.findUnique({
    where: { userId },
    select: { id: true, isActive: true },
  });
  if (!conn?.isActive) {
    throw new Error('Google Drive not connected');
  }
  const { drive } = await getDriveClient(conn.id);
  const drives: SharedDriveItem[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.drives.list({
      pageSize: 100,
      pageToken,
      fields: 'nextPageToken, drives(id, name)',
    });
    for (const d of res.data.drives ?? []) {
      if (!d.id || !d.name) continue;
      drives.push({ id: d.id, name: d.name });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  drives.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return drives;
}

/**
 * List immediate children for the Drive picker.
 * - parent=root → My Drive root
 * - parent=shared-drives-root → Shared Drive list (as folders)
 * - driveId set → list inside that Shared Drive (corpora=drive)
 */
export async function listDriveBrowseItems(
  userId: string,
  parentId = 'root',
  options?: { driveId?: string | null }
): Promise<DriveBrowseItem[]> {
  const conn = await prisma.googleDriveConnection.findUnique({
    where: { userId },
    select: { id: true, isActive: true },
  });
  if (!conn?.isActive) {
    throw new Error('Google Drive not connected');
  }

  if (parentId === SHARED_DRIVES_ROOT) {
    const drives = await listSharedDrives(userId);
    return drives.map((d) => ({
      id: d.id,
      name: d.name,
      mimeType: GOOGLE_FOLDER_MIME,
      kind: 'folder' as const,
    }));
  }

  const { drive } = await getDriveClient(conn.id);
  const driveId = options?.driveId?.trim() || null;
  const parent = parentId === 'root' ? 'root' : parentId;
  const safeParent = parent.replace(/'/g, "\\'");
  const q =
    parent === 'root'
      ? "'root' in parents and trashed = false"
      : `'${safeParent}' in parents and trashed = false`;

  const items: DriveBrowseItem[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 200,
      pageToken,
      ...(driveId
        ? {
            corpora: 'drive' as const,
            driveId,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
          }
        : {
            spaces: 'drive',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          }),
    });
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name || !f.mimeType) continue;
      items.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        kind: f.mimeType === GOOGLE_FOLDER_MIME ? 'folder' : 'file',
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Folders first, then files — alphabetical within each group
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return items;
}

/** @deprecated Prefer listDriveBrowseItems — kept for callers that only need folders. */
export async function listDriveFolders(
  userId: string,
  parentId = 'root'
): Promise<SyncFolder[]> {
  const items = await listDriveBrowseItems(userId, parentId);
  return items.filter((i) => i.kind === 'folder').map((i) => ({ id: i.id, name: i.name }));
}

export async function syncGoogleDriveConnection(connectionId: string): Promise<DriveSyncResult> {
  if (activeSyncs.has(connectionId)) {
    throw new Error('Sync already in progress for this connection');
  }
  activeSyncs.add(connectionId);

  const errors: string[] = [];
  let synced = 0;
  let skipped = 0;
  let removed = 0;
  const seenExternalIds = new Set<string>();

  try {
  const { drive, conn } = await getDriveClient(connectionId);
  const syncFolders = parseSyncFolders(conn.folderIds);
  const folderIds = syncFolders.map((f) => f.id);

  if (folderIds.length === 0) {
    logger.info('Drive sync: no folders configured', { connectionId });
    return { synced: 0, skipped: 0, removed: 0, errors: [] };
  }

  const uploadDir = path.join(process.cwd(), getEnv().UPLOAD_DIR);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  for (const folderId of folderIds) {
    const files = await listFilesInFolder(drive, folderId);

    for (const file of files) {
      if (!EXPORTABLE_MIME.has(file.mimeType) && !file.mimeType.startsWith('application/vnd.google-apps.')) {
        skipped++;
        continue;
      }

      seenExternalIds.add(file.id);

      const existing = await prisma.document.findFirst({
        where: { firmId: conn.firmId, externalId: file.id },
      });

      const driveModified = file.modifiedTime ? new Date(file.modifiedTime) : new Date();
      if (existing?.driveModifiedAt && existing.driveModifiedAt >= driveModified && existing.indexStatus === 'INDEXED') {
        skipped++;
        continue;
      }

      try {
        const { localPath, mimeType, size } = await downloadDriveFile(
          drive,
          file.id,
          file.mimeType,
          uploadDir
        );

        const engagementId = conn.defaultEngagementId;
        const engagement = engagementId
          ? await prisma.engagement.findFirst({
              where: { id: engagementId, firmId: conn.firmId },
              select: { clientId: true },
            })
          : null;

        if (existing) {
          if (existing.storagePath && fs.existsSync(existing.storagePath)) {
            fs.unlinkSync(existing.storagePath);
          }
          await prisma.document.update({
            where: { id: existing.id },
            data: {
              fileName: path.basename(localPath),
              originalName: file.name,
              mimeType,
              size,
              storagePath: localPath,
              driveModifiedAt: driveModified,
              syncedAt: new Date(),
              indexStatus: 'PENDING',
              isOcrProcessed: false,
              ...(engagementId
                ? { engagementId, clientId: engagement?.clientId ?? null, visibility: 'ENGAGEMENT' }
                : {}),
            },
          });
          enqueueDocumentIndex(existing.id);
        } else {
          const doc = await prisma.document.create({
            data: {
              fileName: path.basename(localPath),
              originalName: file.name,
              mimeType,
              size,
              storagePath: localPath,
              source: 'GOOGLE_DRIVE',
              externalId: file.id,
              visibility: engagementId ? 'ENGAGEMENT' : 'FIRM',
              firmId: conn.firmId,
              clientId: engagement?.clientId ?? null,
              engagementId: engagementId || null,
              uploadedById: conn.userId,
              driveModifiedAt: driveModified,
              syncedAt: new Date(),
              indexStatus: 'PENDING',
            },
          });
          enqueueDocumentIndex(doc.id);
        }
        synced++;
      } catch (err) {
        const msg = (err as Error).message;
        logger.warn('Drive file sync failed', { fileId: file.id, error: msg });
        errors.push(`${file.name}: ${msg}`);
        skipped++;
      }
    }
  }

  // Remove Drive documents that disappeared from synced folders
  if (seenExternalIds.size > 0) {
    const stale = await prisma.document.findMany({
      where: {
        firmId: conn.firmId,
        source: 'GOOGLE_DRIVE',
        uploadedById: conn.userId,
        externalId: { not: null, notIn: [...seenExternalIds] },
      },
      select: { id: true, firmId: true, storagePath: true, originalName: true },
    });

    for (const doc of stale) {
      try {
        if (doc.firmId) await removeDocumentFromIndex(doc.firmId, doc.id);
        if (doc.storagePath && fs.existsSync(doc.storagePath)) fs.unlinkSync(doc.storagePath);
        await prisma.document.delete({ where: { id: doc.id } });
        removed++;
      } catch (err) {
        errors.push(`Remove ${doc.originalName}: ${(err as Error).message}`);
      }
    }
  }

  await prisma.googleDriveConnection.update({
    where: { id: connectionId },
    data: { lastSyncAt: new Date() },
  });

  return { synced, skipped, removed, errors };
  } finally {
    activeSyncs.delete(connectionId);
  }
}

export async function syncAllActiveDriveConnections(): Promise<void> {
  const connections = await prisma.googleDriveConnection.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  for (const c of connections) {
    try {
      await syncGoogleDriveConnection(c.id);
    } catch (err) {
      logger.error('Drive sync connection failed', {
        connectionId: c.id,
        error: (err as Error).message,
      });
    }
  }
}

export type DriveSendReviewResult = {
  synced: number;
  skipped: number;
  errors: string[];
  documentIds: string[];
};

/**
 * Pull selected Drive file ids into the engagement Document library and return sync stats.
 * Callers notify managers separately.
 */
export async function syncSelectedDriveFilesToEngagement(
  userId: string,
  engagementId: string,
  fileIds: string[]
): Promise<DriveSendReviewResult> {
  const uniqueIds = [...new Set(fileIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error('Select at least one file');
  }
  if (uniqueIds.length > 50) {
    throw new Error('Select at most 50 files at a time');
  }

  const conn = await prisma.googleDriveConnection.findUnique({
    where: { userId },
    select: { id: true, isActive: true, firmId: true, userId: true },
  });
  if (!conn?.isActive) throw new Error('Google Drive not connected');

  const eng = await prisma.engagement.findFirst({
    where: { id: engagementId, firmId: conn.firmId, archivedAt: null },
    select: { id: true, clientId: true, title: true },
  });
  if (!eng) throw new Error('Engagement not found');

  const { drive } = await getDriveClient(conn.id);
  const uploadDir = path.join(process.cwd(), getEnv().UPLOAD_DIR);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];
  const documentIds: string[] = [];

  for (const fileId of uniqueIds) {
    try {
      const meta = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, modifiedTime',
        supportsAllDrives: true,
      });
      if (!meta.data.id || !meta.data.name || !meta.data.mimeType) {
        skipped++;
        errors.push(`${fileId}: not found`);
        continue;
      }
      if (meta.data.mimeType === GOOGLE_FOLDER_MIME) {
        skipped++;
        errors.push(`${meta.data.name}: folders cannot be sent — open and select files`);
        continue;
      }
      if (
        !EXPORTABLE_MIME.has(meta.data.mimeType) &&
        !meta.data.mimeType.startsWith('application/vnd.google-apps.')
      ) {
        skipped++;
        errors.push(`${meta.data.name}: unsupported type`);
        continue;
      }

      const { localPath, mimeType, size } = await downloadDriveFile(
        drive,
        meta.data.id,
        meta.data.mimeType,
        uploadDir
      );
      const driveModified = meta.data.modifiedTime
        ? new Date(meta.data.modifiedTime)
        : new Date();

      const existing = await prisma.document.findFirst({
        where: { firmId: conn.firmId, externalId: meta.data.id },
      });

      if (existing) {
        if (existing.storagePath && fs.existsSync(existing.storagePath)) {
          try {
            fs.unlinkSync(existing.storagePath);
          } catch {
            /* ignore stale path */
          }
        }
        await prisma.document.update({
          where: { id: existing.id },
          data: {
            fileName: path.basename(localPath),
            originalName: meta.data.name,
            mimeType,
            size,
            storagePath: localPath,
            driveModifiedAt: driveModified,
            syncedAt: new Date(),
            indexStatus: 'PENDING',
            isOcrProcessed: false,
            engagementId: eng.id,
            clientId: eng.clientId,
            visibility: 'ENGAGEMENT',
          },
        });
        enqueueDocumentIndex(existing.id);
        documentIds.push(existing.id);
      } else {
        const doc = await prisma.document.create({
          data: {
            fileName: path.basename(localPath),
            originalName: meta.data.name,
            mimeType,
            size,
            storagePath: localPath,
            source: 'GOOGLE_DRIVE',
            externalId: meta.data.id,
            visibility: 'ENGAGEMENT',
            firmId: conn.firmId,
            clientId: eng.clientId,
            engagementId: eng.id,
            uploadedById: conn.userId,
            driveModifiedAt: driveModified,
            syncedAt: new Date(),
            indexStatus: 'PENDING',
          },
        });
        enqueueDocumentIndex(doc.id);
        documentIds.push(doc.id);
      }
      synced++;
    } catch (err) {
      skipped++;
      errors.push(`${fileId}: ${(err as Error).message}`);
    }
  }

  return { synced, skipped, errors, documentIds };
}

/** Full Drive scope — required to create folders in Shared Drives. Users must reconnect after scope change. */
export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'email',
] as const;

export function buildGoogleAuthUrl(state: string): string {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [...GOOGLE_DRIVE_SCOPES],
    state,
  });
}

/** Opaque storage kind — engagement tree stays independent of Drive layout. */
export type DriveLinkKind = 'SHARED_DRIVE' | 'SHARED_FOLDER';

export type LinkableFolderMeta = {
  id: string;
  name: string;
  driveId: string | null;
  linkKind: DriveLinkKind;
  webViewLink: string | null;
};

/** @deprecated Use LinkableFolderMeta */
export type SharedDriveFolderMeta = LinkableFolderMeta & { driveId: string };

export function resolveDriveLinkKind(driveId: string | null | undefined): DriveLinkKind {
  return driveId ? 'SHARED_DRIVE' : 'SHARED_FOLDER';
}

/** Resolve any linkable folder (Shared Drive or Shared Folder / My Drive). */
export async function getLinkableFolderMeta(
  userId: string,
  folderId: string
): Promise<LinkableFolderMeta> {
  const conn = await prisma.googleDriveConnection.findUnique({
    where: { userId },
    select: { id: true, isActive: true },
  });
  if (!conn?.isActive) throw new Error('Google Drive not connected');

  const { drive } = await getDriveClient(conn.id);
  const res = await drive.files.get({
    fileId: folderId,
    fields: 'id, name, mimeType, driveId, webViewLink',
    supportsAllDrives: true,
  });
  if (!res.data.id || !res.data.name) throw new Error('Folder not found');
  if (res.data.mimeType !== GOOGLE_FOLDER_MIME) throw new Error('Selected item is not a folder');
  const driveId = res.data.driveId ?? null;
  return {
    id: res.data.id,
    name: res.data.name,
    driveId,
    linkKind: resolveDriveLinkKind(driveId),
    webViewLink: res.data.webViewLink ?? `https://drive.google.com/drive/folders/${res.data.id}`,
  };
}

/** Resolve a folder and require Shared Drive (legacy callers). */
export async function getSharedDriveFolderMeta(
  userId: string,
  folderId: string
): Promise<SharedDriveFolderMeta> {
  const meta = await getLinkableFolderMeta(userId, folderId);
  if (!meta.driveId || meta.linkKind !== 'SHARED_DRIVE') {
    throw new Error('Folder must be inside a Google Workspace Shared Drive (not My Drive)');
  }
  return { ...meta, driveId: meta.driveId };
}

/**
 * Create a folder under a Shared Drive parent or a Shared Folder / My Drive parent.
 * Pass driveId when creating inside a Shared Drive; omit for Shared Folder.
 */
export async function createLinkableFolder(
  userId: string,
  opts: { name: string; parentId: string; driveId?: string | null }
): Promise<LinkableFolderMeta> {
  const name = opts.name.trim();
  if (!name) throw new Error('Folder name is required');
  if (!opts.parentId) throw new Error('Parent folder is required');

  const conn = await prisma.googleDriveConnection.findUnique({
    where: { userId },
    select: { id: true, isActive: true },
  });
  if (!conn?.isActive) throw new Error('Google Drive not connected');

  const { drive } = await getDriveClient(conn.id);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: GOOGLE_FOLDER_MIME,
      parents: [opts.parentId],
    },
    fields: 'id, name, driveId, webViewLink',
    supportsAllDrives: true,
  });
  if (!res.data.id || !res.data.name) throw new Error('Failed to create folder');
  const driveId = res.data.driveId ?? opts.driveId?.trim() ?? null;
  return {
    id: res.data.id,
    name: res.data.name,
    driveId,
    linkKind: resolveDriveLinkKind(driveId),
    webViewLink: res.data.webViewLink ?? `https://drive.google.com/drive/folders/${res.data.id}`,
  };
}

/** Create a folder under a Shared Drive parent (parent may be the drive root = driveId). */
export async function createSharedDriveFolder(
  userId: string,
  opts: { name: string; parentId: string; driveId: string }
): Promise<SharedDriveFolderMeta> {
  if (!opts.driveId) throw new Error('Shared Drive parent is required');
  const meta = await createLinkableFolder(userId, opts);
  if (!meta.driveId) throw new Error('Created folder is not on a Shared Drive');
  return { ...meta, driveId: meta.driveId };
}

export async function exchangeGoogleCode(
  code: string,
  userId: string,
  firmId: string
): Promise<{ email: string | null }> {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('No refresh token — revoke app access in Google Account and reconnect');
  }

  oauth2.setCredentials(tokens);
  const oauth2api = google.oauth2({ version: 'v2', auth: oauth2 });
  const me = await oauth2api.userinfo.get();
  const email = me.data.email ?? null;

  await prisma.googleDriveConnection.upsert({
    where: { userId },
    create: {
      userId,
      firmId,
      googleEmail: email,
      encryptedRefreshToken: encryptSecret(tokens.refresh_token),
      encryptedAccessToken: tokens.access_token
        ? encryptSecret(tokens.access_token)
        : null,
      accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      isActive: true,
    },
    update: {
      firmId,
      googleEmail: email,
      encryptedRefreshToken: encryptSecret(tokens.refresh_token),
      encryptedAccessToken: tokens.access_token
        ? encryptSecret(tokens.access_token)
        : null,
      accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      isActive: true,
    },
  });

  return { email };
}

export { getOAuthClient };
