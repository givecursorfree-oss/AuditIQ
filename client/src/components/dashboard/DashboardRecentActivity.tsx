import { FileText, Pencil, Plus, Trash2, LogIn } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

import { GradientAvatar } from '@/components/ui/gradient-avatar';

import { cn } from '@/lib/utils';

import type { ActivityItem } from '@/types';



interface DashboardRecentActivityProps {

  activities: ActivityItem[];

}



const actionMeta: Record<string, { icon: LucideIcon; className: string; label: string }> = {

  create: { icon: Plus, className: 'text-emerald-600 dark:text-emerald-400', label: 'Created' },

  update: { icon: Pencil, className: 'text-cyan-600 dark:text-cyan-400', label: 'Updated' },

  delete: { icon: Trash2, className: 'text-amber-600 dark:text-amber-400', label: 'Deleted' },

  login: { icon: LogIn, className: 'text-violet-600 dark:text-violet-400', label: 'Login' },

};



function ActionCell({ action }: { action: string }) {

  const key = action.toLowerCase();

  const meta = actionMeta[key] ?? { icon: FileText, className: 'text-muted-foreground', label: action };

  const Icon = meta.icon;

  return (

    <div className="flex items-center gap-1.5">

      <Icon className={cn('size-3.5 shrink-0', meta.className)} />

      <span className={cn('text-sm capitalize', meta.className)}>{meta.label}</span>

    </div>

  );

}



export function DashboardRecentActivity({ activities }: DashboardRecentActivityProps) {

  if (activities.length === 0) return null;



  return (

    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-card">

      <div className="px-4 py-3 border-b border-border">

        <h3 className="font-medium text-base text-foreground">Recent Activity</h3>

      </div>

      <div className="overflow-x-auto">

        <table className="w-full text-sm">

          <thead>

            <tr className="border-b border-border bg-muted/40">

              <th className="h-10 px-4 text-left text-xs font-medium text-muted-foreground">User</th>

              <th className="h-10 px-4 text-left text-xs font-medium text-muted-foreground">Action</th>

              <th className="h-10 px-4 text-left text-xs font-medium text-muted-foreground">Entity</th>

              <th className="h-10 px-4 text-right text-xs font-medium text-muted-foreground">When</th>

            </tr>

          </thead>

          <tbody>

            {activities.slice(0, 12).map((activity) => {

              const seed = `${activity.user.firstName}-${activity.user.lastName}`;

              const when = new Date(activity.createdAt).toLocaleString('en-IN', {

                day: '2-digit',

                month: 'short',

                hour: '2-digit',

                minute: '2-digit',

              });

              return (

                <tr

                  key={activity.id}

                  className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors"

                >

                  <td className="px-4 py-3.5">

                    <div className="flex items-center gap-2.5 min-w-[140px]">

                      <GradientAvatar seed={seed} initials={activity.user.initials} size="sm" />

                      <span className="font-medium text-foreground truncate">

                        {activity.user.firstName} {activity.user.lastName}

                      </span>

                    </div>

                  </td>

                  <td className="px-4 py-3.5">

                    <ActionCell action={activity.action} />

                  </td>

                  <td className="px-4 py-3.5 text-muted-foreground truncate max-w-[220px]">

                    {activity.entity}

                  </td>

                  <td className="px-4 py-3.5 text-right text-muted-foreground whitespace-nowrap tabular-nums">

                    {when}

                  </td>

                </tr>

              );

            })}

          </tbody>

        </table>

      </div>

    </div>

  );

}

