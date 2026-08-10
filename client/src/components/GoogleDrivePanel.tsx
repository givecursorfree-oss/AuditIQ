import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CloudArrowUp,
  X,
  ArrowsClockwise,
  Folder,
  CaretRight as ChevronRight,
  CaretLeft as ChevronLeft,
  Check,
} from '@phosphor-icons/react';
import api from '../services/api';
import type { GoogleDriveStatus, SyncFolder } from '../types';

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface Props {
  status: GoogleDriveStatus | null;
  canManage: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSynced: () => void;
}

export default function GoogleDrivePanel({
  status,
  canManage,
  onClose,
  onRefresh,
  onSynced,
}: Props) {
  const [engagements, setEngagements] = useState<{ id: string; title: string }[]>([]);
  const [browseParent, setBrowseParent] = useState('root');
  const [browseStack, setBrowseStack] = useState<SyncFolder[]>([]);
  const [browseFolders, setBrowseFolders] = useState<SyncFolder[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'error' | 'success'>('info');
  const [driveDraft, setDriveDraft] = useState<{
    folders: SyncFolder[] | null;
    engagementId: string | null;
  }>({ folders: null, engagementId: null });

  const defaultFolders = useMemo(
    () =>
      status?.folders?.length
        ? status.folders
        : (status?.folderIds || []).map((id) => ({ id, name: id })),
    [status]
  );
  const selectedFolders = driveDraft.folders ?? defaultFolders;
  const engagementId = driveDraft.engagementId ?? status?.defaultEngagementId ?? '';

  useEffect(() => {
    setDriveDraft({ folders: null, engagementId: null });
  }, [status?.folders, status?.folderIds, status?.defaultEngagementId]);

  useEffect(() => {
    api
      .get('/engagements')
      .then(({ data }) => {
        const list = (data.engagements || data || []).map((e: { id: string; title: string }) => ({
          id: e.id,
          title: e.title,
        }));
        setEngagements(list);
      })
      .catch(() => {});
  }, []);

  const loadBrowseFolders = useCallback(
    async (parent: string) => {
      if (!status?.connected || !canManage) return;
      setBrowseLoading(true);
      try {
        const { data } = await api.get<{ folders: SyncFolder[] }>(
          `/integrations/google-drive/folders?parent=${encodeURIComponent(parent)}`
        );
        setBrowseFolders(data.folders);
      } catch {
        setBrowseFolders([]);
      } finally {
        setBrowseLoading(false);
      }
    },
    [status?.connected, canManage]
  );

  useEffect(() => {
    if (status?.connected && canManage) {
      void loadBrowseFolders(browseParent);
    }
  }, [status?.connected, canManage, browseParent, loadBrowseFolders]);

  const showMsg = (text: string, tone: 'info' | 'error' | 'success' = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const connect = async () => {
    try {
      const { data } = await api.get<{ url: string }>('/integrations/google-drive/auth-url');
      window.location.href = data.url;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showMsg(msg || 'Google Drive is not configured on the server', 'error');
    }
  };

  const toggleFolder = (folder: SyncFolder) => {
    setDriveDraft((draft) => {
      const current = draft.folders ?? defaultFolders;
      const exists = current.some((f) => f.id === folder.id);
      const folders = exists ? current.filter((f) => f.id !== folder.id) : [...current, folder];
      return { ...draft, folders };
    });
  };

  const openSubfolder = (folder: SyncFolder) => {
    setBrowseStack((s) => [...s, folder]);
    setBrowseParent(folder.id);
  };

  const goBrowseBack = () => {
    setBrowseStack((s) => {
      const next = [...s];
      next.pop();
      const parent = next.length ? next[next.length - 1].id : 'root';
      setBrowseParent(parent);
      return next;
    });
  };

  const saveSettings = async () => {
    setSaving(true);
    showMsg('');
    try {
      await api.patch('/integrations/google-drive/settings', {
        folders: selectedFolders,
        defaultEngagementId: engagementId || null,
      });
      onRefresh();
      showMsg('Sync settings saved', 'success');
    } catch {
      showMsg('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    showMsg('');
    try {
      const { data } = await api.post<{
        synced: number;
        skipped: number;
        removed: number;
        errors?: string[];
      }>('/integrations/google-drive/sync');
      const errNote =
        data.errors && data.errors.length > 0
          ? ` · ${data.errors.length} warning(s)`
          : '';
      showMsg(
        `Synced ${data.synced}, skipped ${data.skipped}, removed ${data.removed}${errNote}`,
        data.errors?.length ? 'error' : 'success'
      );
      onSynced();
      onRefresh();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { error?: string }; status?: number } })?.response;
      showMsg(res?.data?.error || 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    await api.delete('/integrations/google-drive');
    onRefresh();
    showMsg('Disconnected from Google Drive', 'info');
  };

  return (
    <div className="card border border-border">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span className="icon-well-sm">
              <CloudArrowUp size={18} />
            </span>
            Google Drive sync
          </h2>
          <p className="text-xs text-foreground-muted mt-1 max-w-xl">
            Sync folders from Google Drive into Document Library. Files are extracted with Apache Tika
            and indexed in Typesense for instant name + content search — same stack as{' '}
            <a
              href="https://github.com/Hamza5/file-brain"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              File Brain
            </a>
            .
          </p>
        </div>
        <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      {!status?.configured && (
        <p className="text-sm text-amber-700 dark:text-amber-300 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          Server admin must set <code className="text-xs">GOOGLE_CLIENT_ID</code>,{' '}
          <code className="text-xs">GOOGLE_CLIENT_SECRET</code>, and{' '}
          <code className="text-xs">GOOGLE_REDIRECT_URI</code> in server <code className="text-xs">.env</code>.
        </p>
      )}

      {!canManage && (
        <p className="text-sm text-foreground-muted mb-3">
          Only Partners, Admins, and Managers can connect or sync Google Drive.
        </p>
      )}

      {status?.connected ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            Connected as <strong>{status.googleEmail}</strong>
            {status.lastSyncAt && (
              <span className="text-foreground-muted"> · Last sync {timeAgo(status.lastSyncAt)}</span>
            )}
          </p>

          {canManage && (
            <>
              <fieldset>
                <legend className="block text-xs font-medium text-foreground-secondary mb-2">
                  Folders to sync
                </legend>
                {selectedFolders.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedFolders.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleFolder(f)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-hover-bg"
                      >
                        <Folder size={12} />
                        {f.name}
                        <X size={12} className="text-foreground-muted" />
                      </button>
                    ))}
                  </div>
                )}

                <div className="rounded-lg border border-border bg-surface-muted/50 overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-foreground-muted">
                    {browseStack.length > 0 && (
                      <button type="button" onClick={goBrowseBack} className="icon-btn p-1">
                        <ChevronLeft size={14} />
                      </button>
                    )}
                    <span className="font-medium text-foreground-secondary">
                      {browseStack.length === 0 ? 'My Drive' : browseStack[browseStack.length - 1].name}
                    </span>
                  </div>
                  <ul className="max-h-48 overflow-y-auto divide-y divide-border">
                    {browseLoading ? (
                      <li className="px-3 py-4 text-sm text-foreground-muted text-center">Loading folders…</li>
                    ) : browseFolders.length === 0 ? (
                      <li className="px-3 py-4 text-sm text-foreground-muted text-center">No subfolders</li>
                    ) : (
                      browseFolders.map((folder) => {
                        const selected = selectedFolders.some((f) => f.id === folder.id);
                        return (
                          <li key={folder.id} className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleFolder(folder)}
                              className={`flex flex-1 items-center gap-2 px-3 py-2 text-sm text-left hover:bg-hover-bg ${
                                selected ? 'bg-surface-muted font-medium' : ''
                              }`}
                            >
                              <Folder size={16} className="text-foreground-muted shrink-0" />
                              <span className="truncate flex-1">{folder.name}</span>
                              {selected && <Check size={14} className="text-success shrink-0" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => openSubfolder(folder)}
                              className="p-2 text-foreground-muted hover:text-foreground hover:bg-hover-bg"
                              title="Open folder"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </fieldset>

              <div>
                <label htmlFor="gdrive-default-engagement" className="block text-xs font-medium text-foreground-secondary mb-1">
                  Default engagement for synced files
                </label>
                <select
                  id="gdrive-default-engagement"
                  value={engagementId}
                  onChange={(e) =>
                    setDriveDraft((draft) => ({ ...draft, engagementId: e.target.value }))
                  }
                  className="input-field text-sm"
                >
                  <option value="">Select engagement (required for sync)</option>
                  {engagements.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={saveSettings} disabled={saving} className="btn-secondary text-sm">
                  {saving ? 'Saving…' : 'Save settings'}
                </button>
                <button
                  type="button"
                  onClick={runSync}
                  disabled={syncing || selectedFolders.length === 0 || !engagementId}
                  className="btn-primary text-sm flex items-center gap-1 disabled:opacity-50"
                >
                  <ArrowsClockwise size={14} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
                <button type="button" onClick={disconnect} className="btn-secondary text-sm text-danger">
                  Disconnect
                </button>
              </div>
            </>
          )}
        </div>
      ) : canManage ? (
        <button
          type="button"
          onClick={connect}
          disabled={!status?.configured}
          className="btn-primary text-sm disabled:opacity-50"
        >
          Connect Google Drive
        </button>
      ) : null}

      {message && (
        <p
          className={`text-sm mt-3 ${
            messageTone === 'error'
              ? 'text-danger'
              : messageTone === 'success'
                ? 'text-success'
                : 'text-foreground-muted'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
