import { CaretDown, CaretUp, UserCircle } from '@phosphor-icons/react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export interface TeamUserOpt {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  hierarchyLevel?: { code: string; sortOrder?: number } | null;
}

export interface TeamWorkloadInfo {
  id: string;
  activeEngagements: number;
  upcomingDeadlines: number;
  availability: 'Available' | 'Engaged' | 'On Leave';
  highWorkload: boolean;
}

function displayName(user: TeamUserOpt) {
  return `${user.firstName} ${user.lastName}`;
}

export function TeamWorkloadChip({
  userId,
  workload,
}: {
  userId: string;
  workload: TeamWorkloadInfo[];
}) {
  const w = workload.find((item) => item.id === userId);
  if (!w) return null;
  const busy = w.highWorkload || w.availability === 'On Leave';
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
        busy ? 'bg-warning/20 text-warning' : 'bg-muted text-muted-foreground'
      }`}
      title={`${w.activeEngagements} engagements · ${w.upcomingDeadlines} deadlines`}
    >
      {w.activeEngagements} eng · {w.availability === 'On Leave' ? 'Leave' : w.availability}
    </span>
  );
}

export function TeamPriorityBadge({ rank }: { rank: number }) {
  return (
    <span
      className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded bg-primary/15 text-primary shrink-0"
      title={rank === 1 ? 'Primary contact for this role' : `Priority ${rank}`}
    >
      #{rank}
    </span>
  );
}

export function TeamUserRow({
  user,
  checked,
  priorityRank,
  canMoveUp,
  canMoveDown,
  disabled,
  workload,
  onToggle,
  onMoveUp,
  onMoveDown,
  onViewAvailability,
}: {
  user: TeamUserOpt;
  checked: boolean;
  priorityRank: number | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled?: boolean;
  workload: TeamWorkloadInfo[];
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onViewAvailability: (userId: string) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 text-sm py-1.5 px-1 rounded-md hover:bg-muted/40 ${
        checked ? 'bg-primary/5 ring-1 ring-primary/15' : ''
      }`}
    >
      <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
        <Checkbox checked={checked} disabled={disabled} onCheckedChange={onToggle} />
        {checked && priorityRank !== null ? <TeamPriorityBadge rank={priorityRank} /> : null}
        <span className="truncate">{displayName(user)}</span>
        <TeamWorkloadChip userId={user.id} workload={workload} />
      </label>
      <span className="flex items-center gap-0.5 shrink-0">
        {checked ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              disabled={disabled || !canMoveUp}
              title="Higher priority"
              onClick={onMoveUp}
            >
              <CaretUp size={14} weight="bold" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              disabled={disabled || !canMoveDown}
              title="Lower priority"
              onClick={onMoveDown}
            >
              <CaretDown size={14} weight="bold" />
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          title="View schedule & active tasks"
          onClick={() => onViewAvailability(user.id)}
        >
          <UserCircle size={16} />
        </Button>
      </span>
    </div>
  );
}

export function TeamRoleList({
  label,
  options,
  selectedIds,
  disabled,
  workload,
  onToggleUser,
  onMoveUser,
  onViewAvailability,
}: {
  label: string;
  options: TeamUserOpt[];
  selectedIds: string[];
  disabled?: boolean;
  workload: TeamWorkloadInfo[];
  onToggleUser: (userId: string, selectedIds: string[]) => void;
  onMoveUser: (userId: string, direction: -1 | 1, selectedIds: string[]) => void;
  onViewAvailability: (userId: string) => void;
}) {
  const listClassName =
    'space-y-0.5 min-h-[12rem] max-h-64 overflow-y-auto border border-border rounded-lg p-2 bg-muted/10';

  return (
    <div className="flex flex-col">
      <Label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {selectedIds.length > 0 ? (
        <p className="text-[11px] text-muted-foreground mb-2">
          Selected at top in priority order — #1 is primary. Use arrows to reorder.
        </p>
      ) : null}
      <div className={listClassName}>
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">No one available for this role.</p>
        ) : (
          options.map((user) => {
            const checked = selectedIds.includes(user.id);
            const rank = checked ? selectedIds.indexOf(user.id) + 1 : null;
            const index = selectedIds.indexOf(user.id);
            return (
              <TeamUserRow
                key={user.id}
                user={user}
                checked={checked}
                priorityRank={rank}
                canMoveUp={checked && index > 0}
                canMoveDown={checked && index >= 0 && index < selectedIds.length - 1}
                disabled={disabled}
                workload={workload}
                onToggle={() => onToggleUser(user.id, selectedIds)}
                onMoveUp={() => onMoveUser(user.id, -1, selectedIds)}
                onMoveDown={() => onMoveUser(user.id, 1, selectedIds)}
                onViewAvailability={onViewAvailability}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
