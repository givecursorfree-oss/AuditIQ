import { useCallback, useEffect, useMemo, useState } from 'react';
import { CaretDown, Key, SignIn, SpinnerGap } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { usePermissions } from '../../hooks/usePermissions';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  matchVaultEntry,
  openVaultPortalLogin,
  suggestPortalName,
  type VaultPortalEntry,
} from '@/lib/vaultPortalLogin';

interface Props {
  clientId: string;
  engagementType: string;
}

export default function EngagementPortalButtons({ clientId, engagementType }: Props) {
  const { can } = usePermissions();
  const [entries, setEntries] = useState<VaultPortalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const canViewVault = can('vault', 'view');

  const loadEntries = useCallback(async () => {
    if (!canViewVault || !clientId) return;
    setLoading(true);
    try {
      const r = await api.get<Array<VaultPortalEntry & { username: string }>>(
        `/vault?clientId=${encodeURIComponent(clientId)}`
      );
      setEntries(r.data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [canViewVault, clientId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const suggestedName = useMemo(() => suggestPortalName(engagementType), [engagementType]);
  const suggestedEntry = useMemo(
    () => (suggestedName ? matchVaultEntry(entries, suggestedName) : undefined),
    [entries, suggestedName]
  );

  async function handleOpen(entry: VaultPortalEntry) {
    setOpeningId(entry.id);
    setStatusMsg(null);
    try {
      const msg = await openVaultPortalLogin(entry);
      setStatusMsg(msg);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setStatusMsg(ax.response?.data?.error || 'Could not open portal.');
    } finally {
      setOpeningId(null);
    }
  }

  if (!canViewVault) return null;

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {!loading && entries.length === 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          asChild
        >
          <Link to={`/vault?clientId=${encodeURIComponent(clientId)}`}>
            <Key size={14} />
            Add portal credentials
          </Link>
        </Button>
      )}

      {suggestedEntry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          disabled={openingId !== null}
          onClick={() => void handleOpen(suggestedEntry)}
        >
          {openingId === suggestedEntry.id ? (
            <SpinnerGap size={14} className="animate-spin" />
          ) : (
            <SignIn size={14} />
          )}
          {suggestedEntry.portalName}
        </Button>
      )}

      {entries.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={loading}
            >
              {loading ? (
                <SpinnerGap size={14} className="animate-spin" />
              ) : (
                <Key size={14} />
              )}
              Portals
              <CaretDown size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              Sign in with vault credentials
            </DropdownMenuLabel>
            {entries.map((entry) => (
              <DropdownMenuItem
                key={entry.id}
                disabled={openingId !== null}
                onClick={() => void handleOpen(entry)}
              >
                <SignIn size={14} className="mr-2 shrink-0" />
                <span className="truncate">{entry.portalName}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`/vault?clientId=${encodeURIComponent(clientId)}`}>
                Manage credentials
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {statusMsg && (
        <span className="text-[11px] text-muted-foreground max-w-[14rem] truncate" title={statusMsg}>
          {statusMsg}
        </span>
      )}
    </div>
  );
}
