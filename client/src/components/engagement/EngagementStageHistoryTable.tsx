import { GradientAvatar } from '@/components/ui/gradient-avatar';



export interface StageHistoryRow {

  id: string;

  fromStage: string | null;

  toStage: string;

  notes: string | null;

  createdAt: string;

  actor: { firstName: string; lastName: string };

}



export function EngagementStageHistoryTable({ rows }: { rows: StageHistoryRow[] }) {

  if (rows.length === 0) {

    return (

      <p className="text-sm text-muted-foreground text-center py-8">No stage changes yet</p>

    );

  }



  return (

    <div className="overflow-x-auto">

      <table className="w-full text-sm">

        <thead>

          <tr className="border-b border-border bg-muted/40">

            <th className="h-10 px-4 text-left text-xs font-medium text-muted-foreground">User</th>

            <th className="h-10 px-4 text-left text-xs font-medium text-muted-foreground">Change</th>

            <th className="h-10 px-4 text-left text-xs font-medium text-muted-foreground">Notes</th>

            <th className="h-10 px-4 text-right text-xs font-medium text-muted-foreground">When</th>

          </tr>

        </thead>

        <tbody>

          {rows.map((h) => {

            const seed = `${h.actor.firstName}-${h.actor.lastName}`;

            const initials = `${h.actor.firstName[0] ?? ''}${h.actor.lastName[0] ?? ''}`.toUpperCase();

            const change = h.fromStage

              ? `${h.fromStage} → ${h.toStage}`

              : `Started at ${h.toStage}`;

            const when = new Date(h.createdAt).toLocaleString('en-IN', {

              day: '2-digit',

              month: 'short',

              year: 'numeric',

              hour: '2-digit',

              minute: '2-digit',

            });

            return (

              <tr

                key={h.id}

                className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors"

              >

                <td className="px-4 py-3">

                  <div className="flex items-center gap-2.5 min-w-[120px]">

                    <GradientAvatar seed={seed} initials={initials} size="sm" />

                    <span className="font-medium text-foreground truncate">

                      {h.actor.firstName} {h.actor.lastName}

                    </span>

                  </div>

                </td>

                <td className="px-4 py-3 text-foreground font-medium">{change}</td>

                <td className="px-4 py-3 text-muted-foreground max-w-[240px] truncate">

                  {h.notes || '—'}

                </td>

                <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap tabular-nums">

                  {when}

                </td>

              </tr>

            );

          })}

        </tbody>

      </table>

    </div>

  );

}

