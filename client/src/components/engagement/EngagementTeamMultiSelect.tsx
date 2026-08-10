import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/services/api';
import { PanelCard } from '@/components/layout/PanelCard';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import StaffAvailabilityPanel from './StaffAvailabilityPanel';
import { filterUsersForSlot } from '@/lib/assigneeFilters';
import {
  TeamRoleList,
  type TeamUserOpt,
  type TeamWorkloadInfo,
} from './EngagementTeamMultiSelectParts';

interface Props {
  engagementId: string;
  disabled?: boolean;
  onSaved?: () => void;
}

const WORKLOAD_POLL_MS = 30_000;

function displayName(user: TeamUserOpt) {
  return `${user.firstName} ${user.lastName}`;
}

function hierarchySortKey(user: TeamUserOpt): number {
  return user.hierarchyLevel?.sortOrder ?? 999;
}

function sortOptionsForDisplay(options: TeamUserOpt[], selectedIds: string[]): TeamUserOpt[] {
  const byId = new Map(options.map((u) => [u.id, u]));
  const selected = selectedIds.map((id) => byId.get(id)).filter((u): u is TeamUserOpt => !!u);
  const selectedSet = new Set(selectedIds);
  const unselected = options
    .filter((u) => !selectedSet.has(u.id))
    .sort((a, b) => {
      const order = hierarchySortKey(a) - hierarchySortKey(b);
      if (order !== 0) return order;
      return displayName(a).localeCompare(displayName(b));
    });
  return [...selected, ...unselected];
}

function moveInList(list: string[], id: string, direction: -1 | 1): string[] {
  const index = list.indexOf(id);
  if (index < 0) return list;
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function EngagementTeamMultiSelect({ engagementId, disabled, onSaved }: Props) {
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [employees, setEmployees] = useState<TeamUserOpt[]>([]);
  const [workload, setWorkload] = useState<TeamWorkloadInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [availabilityStaffId, setAvailabilityStaffId] = useState<string | null>(null);

  const refreshWorkload = useCallback(async () => {
    try {
      const wlRes = await api.get<TeamWorkloadInfo[]>('/employees/workload-summary');
      setWorkload(Array.isArray(wlRes.data) ? wlRes.data : []);
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const [teamRes, empRes] = await Promise.all([
        api.get<{
          managers: TeamUserOpt[];
          staff: TeamUserOpt[];
          managerIds?: string[];
          staffIds?: string[];
          primary: { partner: TeamUserOpt | null };
        }>(`/engagements/${engagementId}/team`),
        api.get<TeamUserOpt[]>('/employees').catch(() => ({ data: [] as TeamUserOpt[] })),
      ]);
      const managers = teamRes.data.managerIds ?? teamRes.data.managers.map((m) => m.id);
      const staff = teamRes.data.staffIds ?? teamRes.data.staff.map((s) => s.id);
      setManagerIds(managers);
      setStaffIds(staff);
      setPartnerId(teamRes.data.primary.partner?.id ?? null);
      setEmployees(empRes.data);
      await refreshWorkload();
    })();
  }, [engagementId, refreshWorkload]);

  useEffect(() => {
    const interval = window.setInterval(() => void refreshWorkload(), WORKLOAD_POLL_MS);
    return () => window.clearInterval(interval);
  }, [refreshWorkload]);

  const partnerOptions = filterUsersForSlot(employees, 'partner');
  const managerOptions = filterUsersForSlot(employees, 'manager').filter(
    (u) => u.role !== 'Staff' && u.role !== 'Intern'
  );
  const staffOptions = filterUsersForSlot(employees, 'article');

  const sortedManagerOptions = useMemo(
    () => sortOptionsForDisplay(managerOptions, managerIds),
    [managerOptions, managerIds]
  );
  const sortedStaffOptions = useMemo(
    () => sortOptionsForDisplay(staffOptions, staffIds),
    [staffOptions, staffIds]
  );

  function toggle(id: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await api.put(`/engagements/${engagementId}/team`, {
        managerIds,
        staffIds,
        partnerId,
      });
      setSaved(true);
      await refreshWorkload();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PanelCard title="Team assignment">
        <p className="text-xs text-muted-foreground mb-4">
          Assign or update the engagement team anytime. Select multiple managers and staff with checkboxes;
          priority order (#1 first) sets who is primary for notifications and defaults.
        </p>

        <div className="mb-4">
          <Label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Partner in charge
          </Label>
          <select
            className="input-field w-full max-w-md"
            value={partnerId ?? ''}
            disabled={disabled}
            onChange={(e) => {
              setPartnerId(e.target.value || null);
              setSaved(false);
            }}
          >
            <option value="">— Select partner —</option>
            {partnerOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {displayName(u)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <TeamRoleList
            label="Managers"
            options={sortedManagerOptions}
            selectedIds={managerIds}
            disabled={disabled}
            workload={workload}
            onToggleUser={(userId, selectedIds) => toggle(userId, selectedIds, setManagerIds)}
            onMoveUser={(userId, direction, selectedIds) => {
              setManagerIds(moveInList(selectedIds, userId, direction));
              setSaved(false);
            }}
            onViewAvailability={setAvailabilityStaffId}
          />
          <TeamRoleList
            label="Staff"
            options={sortedStaffOptions}
            selectedIds={staffIds}
            disabled={disabled}
            workload={workload}
            onToggleUser={(userId, selectedIds) => toggle(userId, selectedIds, setStaffIds)}
            onMoveUser={(userId, direction, selectedIds) => {
              setStaffIds(moveInList(selectedIds, userId, direction));
              setSaved(false);
            }}
            onViewAvailability={setAvailabilityStaffId}
          />
        </div>

        {!disabled && (
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save team'}
            </Button>
            {saved && <span className="text-xs text-success">Saved</span>}
          </div>
        )}
      </PanelCard>

      <StaffAvailabilityPanel
        staffId={availabilityStaffId}
        open={!!availabilityStaffId}
        onClose={() => setAvailabilityStaffId(null)}
      />
    </>
  );
}
