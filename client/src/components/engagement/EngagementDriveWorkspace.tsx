import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CloudArrowUp,
  FolderOpen,
  FolderPlus,
  Star,
  Trash,
  ArrowsClockwise,
  CaretLeft,
} from '@phosphor-icons/react';
import api from '../../services/api';
import type { DriveBrowseItem, GoogleDriveStatus } from '../../types';
import { PanelCard } from '../layout/PanelCard';
import { Button } from '@/components/ui/button';
import { formatApiError } from '@/lib/apiErrors';

const SHARED_DRIVES_ROOT = 'shared-drives-root';

type DriveLink = {
  id: string;
  folderId: string;
  driveId: string;
  name: string;
  isPrimary: boolean;
  webViewLink: string;
};

type BrowseStackItem = { id: string; name: string; driveId: string | null };

/**
 * Shared Drive–backed workspace for an engagement: link primary + extra folders,
 * or create a new folder under a Shared Drive.
 */
export default function EngagementDriveWorkspace({
  engagementId,
  engagementTitle,
  canManageDrive,
}: {
  engagementId: string;
  engagementTitle: string;
  canManageDrive: boolean;
}) {
  const [status, setStatus] = useState<GoogleDriveStatus | null>(null);
  const [links, setLinks] = useState<DriveLink[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [browseParent, setBrowseParent] = useState(SHARED_DRIVES_ROOT);
  const [browseDriveId, setBrowseDriveId] = useState<string | null>(null);
  const [browseStack, setBrowseStack] = useState<BrowseStackItem[]>([]);
  const [browseItems, setBrowseItems] = useState<DriveBrowseItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [pasteRef, setPasteRef] = useState('');

  const reloadLinks = useCallback(async () => {
    const { data } = await api.get<{ folders: DriveLink[] }>(
      `/engagements/${engagementId}/drive-folders`
    );
    setLinks(data.folders || []);
  }, [engagementId]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    // Load independently — a folders 404 must not blank Google status
    api
      .get<GoogleDriveStatus>('/integrations/google-drive/status')
      .then(({ data }) => {
        if (!cancelled) setStatus(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(formatApiError(e));
      });
    api
      .get<{ folders: DriveLink[] }>(`/engagements/${engagementId}/drive-folders`)
      .then(({ data }) => {
        if (!cancelled) setLinks(data.folders || []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(formatApiError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  const browseReady =
    status?.browseReady ?? Boolean(status?.configured && status?.connected);

  const loadBrowse = useCallback(
    async (parent: string, driveId: string | null) => {
      if (!browseReady || !canManageDrive) return;
      setBrowseLoading(true);
      setBrowseError(null);
      try {
        const qs = new URLSearchParams({ parent });
        if (driveId) qs.set('driveId', driveId);
        const { data } = await api.get<{ items?: DriveBrowseItem[] }>(
          `/integrations/google-drive/folders?${qs.toString()}`
        );
        setBrowseItems((data.items || []).filter((i) => i.kind === 'folder'));
      } catch (e: unknown) {
        setBrowseItems([]);
        setBrowseError(formatApiError(e));
      } finally {
        setBrowseLoading(false);
      }
    },
    [browseReady, canManageDrive]
  );

  useEffect(() => {
    void loadBrowse(browseParent, browseDriveId);
  }, [browseParent, browseDriveId, loadBrowse]);

  const openFolder = (item: DriveBrowseItem) => {
    if (browseParent === SHARED_DRIVES_ROOT) {
      setBrowseDriveId(item.id);
      setBrowseStack([{ id: item.id, name: item.name, driveId: item.id }]);
      setBrowseParent(item.id);
      return;
    }
    setBrowseStack((s) => [...s, { id: item.id, name: item.name, driveId: browseDriveId }]);
    setBrowseParent(item.id);
  };

  const goBack = () => {
    setBrowseStack((s) => {
      const next = [...s];
      next.pop();
      if (next.length === 0) {
        setBrowseDriveId(null);
        setBrowseParent(SHARED_DRIVES_ROOT);
      } else {
        setBrowseParent(next[next.length - 1].id);
        setBrowseDriveId(next[0]?.driveId ?? next[0]?.id ?? null);
      }
      return next;
    });
  };

  async function linkFolder(folderId: string, asPrimary: boolean) {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/engagements/${engagementId}/drive-folders`, {
        folderId,
        isPrimary: asPrimary,
      });
      await reloadLinks();
    } catch (e: unknown) {
      setActionError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function linkFromPaste() {
    const ref = pasteRef.trim();
    if (!ref) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/engagements/${engagementId}/drive-folders`, {
        folderUrl: ref,
        isPrimary: links.length === 0 || !links.some((l) => l.isPrimary),
      });
      setPasteRef('');
      await reloadLinks();
    } catch (e: unknown) {
      setActionError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function createAndLink() {
    if (!browseDriveId || !newFolderName.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/engagements/${engagementId}/drive-folders/create`, {
        name: newFolderName.trim(),
        parentId: browseParent === SHARED_DRIVES_ROOT ? browseDriveId : browseParent,
        driveId: browseDriveId,
        isPrimary: links.length === 0 || !links.some((l) => l.isPrimary),
      });
      setNewFolderName('');
      await reloadLinks();
      await loadBrowse(browseParent, browseDriveId);
    } catch (e: unknown) {
      setActionError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(linkId: string) {
    setBusy(true);
    setActionError(null);
    try {
      await api.patch(`/engagements/${engagementId}/drive-folders/${linkId}`, { isPrimary: true });
      await reloadLinks();
    } catch (e: unknown) {
      setActionError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function unlink(linkId: string) {
    setBusy(true);
    setActionError(null);
    try {
      await api.delete(`/engagements/${engagementId}/drive-folders/${linkId}`);
      await reloadLinks();
    } catch (e: unknown) {
      setActionError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  const primary = links.find((l) => l.isPrimary) || null;
  const extras = links.filter((l) => !l.isPrimary);
  const canCreateHere = Boolean(browseDriveId && browseParent !== SHARED_DRIVES_ROOT);

  return (
    <div className="space-y-4">
      <PanelCard title="Shared Drive workspace">
        <p className="text-sm text-muted-foreground mb-3">
          <span className="text-foreground font-medium">{engagementTitle}</span> — Shared Drive folders
        </p>
        {loadError && <p className="text-sm text-destructive mb-2">{loadError}</p>}
        {actionError && <p className="text-sm text-destructive mb-2">{actionError}</p>}

        <dl className="grid gap-2 text-sm sm:grid-cols-2 mb-4">
          <div>
            <dt className="text-xs text-muted-foreground">Google connection</dt>
            <dd>
              {!status
                ? '…'
                : !status.configured
                  ? 'OAuth credentials missing on API server (.env.kvm2)'
                  : status.connected
                    ? status.googleEmail || 'Connected'
                    : 'Not connected — reconnect required for Shared Drive write scope'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Primary folder</dt>
            <dd>{primary ? primary.name : 'Not linked'}</dd>
          </div>
        </dl>

        {canManageDrive && (!status?.connected || !status?.configured) && (
          <Button type="button" size="sm" asChild className="mb-3">
            <Link to="/documents">
              <CloudArrowUp size={16} className="mr-1.5" />
              {status?.connected && !status.configured
                ? 'Fix Google Drive on Documents'
                : 'Connect Google Drive'}
            </Link>
          </Button>
        )}

        {canManageDrive && browseReady && (
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              className="input-field flex-1"
              aria-label="Shared Drive folder URL or id"
              placeholder="Paste Shared Drive folder URL or id"
              value={pasteRef}
              onChange={(e) => setPasteRef(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={busy || !pasteRef.trim()}
              onClick={() => void linkFromPaste()}
            >
              Link folder
            </Button>
          </div>
        )}

        {links.length > 0 && (
          <ul className="space-y-2 mb-4">
            {[...(primary ? [primary] : []), ...extras].map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                {link.isPrimary ? (
                  <Star size={14} weight="fill" className="text-amber-500 shrink-0" />
                ) : (
                  <FolderOpen size={14} className="text-muted-foreground shrink-0" />
                )}
                <span className="font-medium flex-1 min-w-0 truncate">{link.name}</span>
                {link.isPrimary && (
                  <span className="text-xs text-muted-foreground">Primary</span>
                )}
                <a
                  href={link.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline"
                >
                  Open in Drive
                </a>
                {canManageDrive && !link.isPrimary && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void setPrimary(link.id)}
                  >
                    Make primary
                  </Button>
                )}
                {canManageDrive && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label="Unlink folder"
                    onClick={() => void unlink(link.id)}
                  >
                    <Trash size={14} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      {canManageDrive && status?.connected && !browseReady && (
        <PanelCard title="Browse Shared Drives">
          <p className="text-sm text-destructive">
            {browseError ||
              'Google Drive OAuth is not configured on the API server. Shared drives cannot be listed until GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI are set and the API container is recreated.'}
          </p>
        </PanelCard>
      )}

      {canManageDrive && browseReady && (
        <PanelCard title="Browse Shared Drives">
          {browseError && <p className="text-sm text-destructive mb-2">{browseError}</p>}
          <div className="flex items-center gap-2 border-b border-border pb-2 mb-2 text-xs text-muted-foreground">
            {browseStack.length > 0 && (
              <button type="button" className="icon-btn p-1" onClick={goBack} aria-label="Back">
                <CaretLeft size={14} />
              </button>
            )}
            <span className="font-medium text-foreground flex-1 truncate">
              {browseStack.length === 0
                ? 'Shared drives'
                : browseStack.map((s) => s.name).join(' / ')}
            </span>
            <button
              type="button"
              className="icon-btn p-1"
              aria-label="Refresh"
              disabled={browseLoading}
              onClick={() => void loadBrowse(browseParent, browseDriveId)}
            >
              <ArrowsClockwise size={14} className={browseLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          <ul className="max-h-64 overflow-y-auto divide-y divide-border rounded-lg border border-border mb-3">
            {browseLoading && browseItems.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground text-center">Loading…</li>
            ) : browseItems.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground text-center">
                No Shared Drive folders here
              </li>
            ) : (
              browseItems.map((item) => (
                <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <button
                    type="button"
                    className="flex items-center gap-2 flex-1 min-w-0 text-left hover:text-primary"
                    onClick={() => openFolder(item)}
                  >
                    <FolderOpen size={16} className="shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void linkFolder(item.id, !primary)}
                    >
                      {primary ? 'Link' : 'Link primary'}
                    </Button>
                    {primary && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void linkFolder(item.id, true)}
                      >
                        As primary
                      </Button>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>

          {canCreateHere && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void linkFolder(browseParent, !primary)}
                >
                  Link this folder{primary ? '' : ' as primary'}
                </Button>
                {primary && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void linkFolder(browseParent, true)}
                  >
                    Link as primary
                  </Button>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="input-field flex-1"
                  aria-label="New folder name"
                  placeholder={`Folder for ${engagementTitle}`.slice(0, 80)}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !newFolderName.trim()}
                  onClick={() => void createAndLink()}
                >
                  <FolderPlus size={16} className="mr-1.5" />
                  Create & link
                </Button>
              </div>
            </div>
          )}
        </PanelCard>
      )}
    </div>
  );
}
