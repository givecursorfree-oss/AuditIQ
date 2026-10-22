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
  File,
  CheckSquare,
  Square,
} from '@phosphor-icons/react';
import api from '../../services/api';
import type { DriveBrowseItem, DriveLinkKind, EngagementDriveFolder, GoogleDriveStatus } from '../../types';
import { PanelCard } from '../layout/PanelCard';
import { Button } from '@/components/ui/button';
import { formatApiError } from '@/lib/apiErrors';

function driveItemOpenUrl(item: DriveBrowseItem): string {
  return item.kind === 'folder'
    ? `https://drive.google.com/drive/folders/${item.id}`
    : `https://drive.google.com/file/d/${item.id}/view`;
}

const SHARED_DRIVES_ROOT = 'shared-drives-root';
const MY_DRIVE_ROOT = 'root';

type BrowseScope = 'shared-drive' | 'shared-folder';
type BrowseStackItem = { id: string; name: string; driveId: string | null };

function linkKindLabel(kind: DriveLinkKind): string {
  return kind === 'SHARED_FOLDER' ? 'Shared folder' : 'Shared Drive';
}

/**
 * Engagement storage workspace: link or create under a Shared Drive or Shared Folder.
 * Engagement structure stays independent of Drive layout — switch later via unlink + re-link.
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
  const [links, setLinks] = useState<EngagementDriveFolder[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [browseScope, setBrowseScope] = useState<BrowseScope>('shared-drive');
  const [browseParent, setBrowseParent] = useState(SHARED_DRIVES_ROOT);
  const [browseDriveId, setBrowseDriveId] = useState<string | null>(null);
  const [browseStack, setBrowseStack] = useState<BrowseStackItem[]>([]);
  const [browseItems, setBrowseItems] = useState<DriveBrowseItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [pasteRef, setPasteRef] = useState('');

  // Primary-folder file browser (view / mark / send for review)
  const [wsParent, setWsParent] = useState<string | null>(null);
  const [wsDriveId, setWsDriveId] = useState<string | null>(null);
  const [wsStack, setWsStack] = useState<BrowseStackItem[]>([]);
  const [wsItems, setWsItems] = useState<DriveBrowseItem[]>([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(() => new Set());
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  const reloadLinks = useCallback(async () => {
    const { data } = await api.get<{ folders: EngagementDriveFolder[] }>(
      `/engagements/${engagementId}/drive-folders`
    );
    setLinks(data.folders || []);
  }, [engagementId]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api
      .get<GoogleDriveStatus>('/integrations/google-drive/status')
      .then(({ data }) => {
        if (!cancelled) setStatus(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(formatApiError(e));
      });
    api
      .get<{ folders: EngagementDriveFolder[] }>(`/engagements/${engagementId}/drive-folders`)
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

  const resetBrowse = (scope: BrowseScope) => {
    setBrowseScope(scope);
    setBrowseStack([]);
    setBrowseDriveId(null);
    setBrowseParent(scope === 'shared-drive' ? SHARED_DRIVES_ROOT : MY_DRIVE_ROOT);
    setNewFolderName('');
  };

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

  const primary = links.find((l) => l.isPrimary) || null;

  // Root workspace browser at primary linked folder
  useEffect(() => {
    if (!primary) {
      setWsParent(null);
      setWsDriveId(null);
      setWsStack([]);
      setWsItems([]);
      setSelectedFileIds(new Set());
      return;
    }
    setWsParent(primary.folderId);
    setWsDriveId(primary.driveId);
    setWsStack([]);
    setSelectedFileIds(new Set());
  }, [primary?.folderId, primary?.driveId]);

  const loadWorkspace = useCallback(
    async (parent: string, driveId: string | null) => {
      if (!browseReady) return;
      setWsLoading(true);
      setWsError(null);
      try {
        const qs = new URLSearchParams({ parent });
        if (driveId) qs.set('driveId', driveId);
        const { data } = await api.get<{ items?: DriveBrowseItem[] }>(
          `/integrations/google-drive/folders?${qs.toString()}`
        );
        setWsItems(data.items || []);
      } catch (e: unknown) {
        setWsItems([]);
        setWsError(formatApiError(e));
      } finally {
        setWsLoading(false);
      }
    },
    [browseReady]
  );

  useEffect(() => {
    if (wsParent) void loadWorkspace(wsParent, wsDriveId);
  }, [wsParent, wsDriveId, loadWorkspace]);

  const openWsFolder = (item: DriveBrowseItem) => {
    setWsStack((s) => [...s, { id: item.id, name: item.name, driveId: wsDriveId }]);
    setWsParent(item.id);
  };

  const wsGoBack = () => {
    if (!primary) return;
    setWsStack((s) => {
      const next = [...s];
      next.pop();
      if (next.length === 0) {
        setWsParent(primary.folderId);
      } else {
        setWsParent(next[next.length - 1].id);
      }
      return next;
    });
  };

  const toggleFile = (id: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function sendSelectedForReview() {
    if (selectedFileIds.size === 0) return;
    setBusy(true);
    setActionError(null);
    setReviewMsg(null);
    try {
      const { data } = await api.post<{ message?: string; synced: number }>(
        `/engagements/${engagementId}/drive-folders/send-review`,
        { fileIds: [...selectedFileIds] }
      );
      setReviewMsg(data.message || `Synced ${data.synced} file(s)`);
      setSelectedFileIds(new Set());
    } catch (e: unknown) {
      setActionError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  const openFolder = (item: DriveBrowseItem) => {
    if (browseScope === 'shared-drive' && browseParent === SHARED_DRIVES_ROOT) {
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
        setBrowseParent(browseScope === 'shared-drive' ? SHARED_DRIVES_ROOT : MY_DRIVE_ROOT);
      } else {
        setBrowseParent(next[next.length - 1].id);
        setBrowseDriveId(
          browseScope === 'shared-drive' ? (next[0]?.driveId ?? next[0]?.id ?? null) : null
        );
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
    const parentId =
      browseScope === 'shared-drive'
        ? browseParent === SHARED_DRIVES_ROOT
          ? browseDriveId
          : browseParent
        : browseParent;
    if (!parentId || !newFolderName.trim()) return;
    if (browseScope === 'shared-drive' && !browseDriveId) return;

    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/engagements/${engagementId}/drive-folders/create`, {
        name: newFolderName.trim(),
        parentId,
        ...(browseDriveId ? { driveId: browseDriveId } : {}),
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

  const extras = links.filter((l) => !l.isPrimary);
  const canCreateHere =
    browseScope === 'shared-drive'
      ? Boolean(browseDriveId && browseParent !== SHARED_DRIVES_ROOT)
      : browseParent !== SHARED_DRIVES_ROOT;
  const canLinkCurrent =
    browseScope === 'shared-drive'
      ? browseParent !== SHARED_DRIVES_ROOT
      : browseParent !== MY_DRIVE_ROOT;
  const browseTitle =
    browseScope === 'shared-drive'
      ? browseStack.length === 0
        ? 'Shared drives'
        : browseStack.map((s) => s.name).join(' / ')
      : browseStack.length === 0
        ? 'My Drive / shared folders'
        : ['My Drive', ...browseStack.map((s) => s.name)].join(' / ');

  return (
    <div className="space-y-4">
      <PanelCard title="Drive storage">
        <p className="text-sm text-muted-foreground mb-3">
          <span className="text-foreground font-medium">{engagementTitle}</span>
          {' — '}
          Shared Drive or Shared Folder
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
                    : 'Not connected'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Primary storage</dt>
            <dd>
              {primary
                ? `${primary.name} (${linkKindLabel(primary.linkKind)})`
                : 'Not linked'}
            </dd>
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
              aria-label="Drive folder URL or id"
              placeholder="Paste Shared Drive or Shared Folder URL or id"
              value={pasteRef}
              onChange={(e) => setPasteRef(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={busy || !pasteRef.trim()}
              onClick={() => void linkFromPaste()}
            >
              Link
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
                <span className="text-xs text-muted-foreground">{linkKindLabel(link.linkKind)}</span>
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
                    aria-label="Unlink"
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

      {primary && browseReady && (
        <PanelCard title="Workspace files">
          <p className="text-sm text-muted-foreground mb-2">
            Contents of <span className="text-foreground font-medium">{primary.name}</span>
            {' — '}
            mark files, then send for review (copies into Client docs + notifies manager/partner)
          </p>
          {wsError && <p className="text-sm text-destructive mb-2">{wsError}</p>}
          {reviewMsg && <p className="text-sm text-success mb-2">{reviewMsg}</p>}

          <div className="flex items-center gap-2 border-b border-border pb-2 mb-2 text-xs text-muted-foreground">
            {wsStack.length > 0 && (
              <button type="button" className="icon-btn p-1" onClick={wsGoBack} aria-label="Back">
                <CaretLeft size={14} />
              </button>
            )}
            <span className="font-medium text-foreground flex-1 truncate">
              {[primary.name, ...wsStack.map((s) => s.name)].join(' / ')}
            </span>
            <button
              type="button"
              className="icon-btn p-1"
              aria-label="Refresh"
              disabled={wsLoading}
              onClick={() => wsParent && void loadWorkspace(wsParent, wsDriveId)}
            >
              <ArrowsClockwise size={14} className={wsLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          <ul className="max-h-80 overflow-y-auto divide-y divide-border rounded-lg border border-border mb-3">
            {wsLoading && wsItems.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground text-center">Loading…</li>
            ) : wsItems.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground text-center">
                No files or folders here
              </li>
            ) : (
              wsItems.map((item) => {
                if (item.kind === 'folder') {
                  return (
                    <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <button
                        type="button"
                        className="flex items-center gap-2 flex-1 min-w-0 text-left hover:text-primary"
                        onClick={() => openWsFolder(item)}
                      >
                        <FolderOpen size={16} className="shrink-0" />
                        <span className="truncate">{item.name}</span>
                      </button>
                      <a
                        href={driveItemOpenUrl(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline shrink-0"
                      >
                        Open
                      </a>
                    </li>
                  );
                }
                const marked = selectedFileIds.has(item.id);
                return (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <button
                      type="button"
                      className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-hover-bg rounded"
                      onClick={() => toggleFile(item.id)}
                      aria-pressed={marked}
                    >
                      {marked ? (
                        <CheckSquare size={18} className="text-success shrink-0" weight="fill" />
                      ) : (
                        <Square size={18} className="text-muted-foreground shrink-0" />
                      )}
                      <File size={16} className="text-muted-foreground shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </button>
                    <a
                      href={driveItemOpenUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline shrink-0"
                    >
                      Open
                    </a>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || selectedFileIds.size === 0}
              onClick={() => void sendSelectedForReview()}
            >
              Send {selectedFileIds.size || ''} for review
            </Button>
            {selectedFileIds.size > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setSelectedFileIds(new Set())}
              >
                Clear selection
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" asChild>
              <Link to={`/engagements/${engagementId}?tab=documents`}>Open Client docs</Link>
            </Button>
          </div>
        </PanelCard>
      )}

      {primary && status?.connected && !browseReady && (
        <PanelCard title="Workspace files">
          <p className="text-sm text-destructive">
            Connect Google Drive (Documents) to browse and send files from this folder.
          </p>
        </PanelCard>
      )}

      {canManageDrive && status?.connected && !browseReady && (
        <PanelCard title="Browse Drive">
          <p className="text-sm text-destructive">
            {browseError ||
              'Google Drive OAuth is not configured on the API server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI, then recreate the API container.'}
          </p>
        </PanelCard>
      )}

      {canManageDrive && browseReady && (
        <PanelCard title="Connect storage">
          <div className="flex gap-2 mb-3">
            <Button
              type="button"
              size="sm"
              variant={browseScope === 'shared-drive' ? 'default' : 'outline'}
              onClick={() => resetBrowse('shared-drive')}
            >
              Shared Drive
            </Button>
            <Button
              type="button"
              size="sm"
              variant={browseScope === 'shared-folder' ? 'default' : 'outline'}
              onClick={() => resetBrowse('shared-folder')}
            >
              Shared folder
            </Button>
          </div>

          {browseError && <p className="text-sm text-destructive mb-2">{browseError}</p>}
          <div className="flex items-center gap-2 border-b border-border pb-2 mb-2 text-xs text-muted-foreground">
            {browseStack.length > 0 && (
              <button type="button" className="icon-btn p-1" onClick={goBack} aria-label="Back">
                <CaretLeft size={14} />
              </button>
            )}
            <span className="font-medium text-foreground flex-1 truncate">{browseTitle}</span>
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
                No folders here
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

          {(canLinkCurrent || canCreateHere) && (
            <div className="space-y-2">
              {canLinkCurrent && (
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
              )}
              {canCreateHere && (
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
              )}
            </div>
          )}
        </PanelCard>
      )}
    </div>
  );
}
