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

function getOAuthClient() {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new Error('Google Drive OAuth is not configured');
  }
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
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
      { fileId, alt: 'media' },
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
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
      pageSize: 100,
      pageToken,
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

/** List immediate child folders in Drive (for folder picker UI). */
export async function listDriveFolders(
  userId: string,
  parentId = 'root'
): Promise<SyncFolder[]> {
  const conn = await prisma.googleDriveConnection.findUnique({
    where: { userId },
    select: { id: true, isActive: true },
  });
  if (!conn?.isActive) {
    throw new Error('Google Drive not connected');
  }

  const { drive } = await getDriveClient(conn.id);
  const parent = parentId === 'root' ? 'root' : parentId;
  const q =
    parent === 'root'
      ? "mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false"
      : `mimeType = 'application/vnd.google-apps.folder' and '${parent}' in parents and trashed = false`;

  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 200,
    orderBy: 'name',
  });

  return (res.data.files ?? [])
    .filter((f): f is { id: string; name: string } => Boolean(f.id && f.name))
    .map((f) => ({ id: f.id, name: f.name }));
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
        if (!engagementId) {
          skipped++;
          if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
          continue;
        }

        const engagement = await prisma.engagement.findFirst({
          where: { id: engagementId, firmId: conn.firmId },
          select: { clientId: true },
        });

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
              visibility: 'ENGAGEMENT',
              firmId: conn.firmId,
              clientId: engagement?.clientId ?? null,
              engagementId,
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

export function buildGoogleAuthUrl(state: string): string {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.readonly', 'email'],
    state,
  });
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
