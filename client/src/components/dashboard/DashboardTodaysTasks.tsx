import { useMemo, useState } from 'react';
import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { DashboardTaskRow, ProjectColor } from './types';

const projectColorMap: Record<ProjectColor, string> = {
  blue: 'rounded-lg border border-border bg-muted/50 text-foreground',
  violet: 'rounded-lg border border-border bg-muted/50 text-foreground',
  cyan: 'rounded-lg border border-border bg-muted/50 text-foreground',
  pink: 'rounded-lg border border-border bg-muted/50 text-foreground',
  amber: 'rounded-lg border border-border bg-muted/50 text-foreground',
};

interface DashboardTodaysTasksProps {
  tasks: DashboardTaskRow[];
  onTaskClick?: (task: DashboardTaskRow) => void;
  onBrowseEngagements?: () => void;
}

export function DashboardTodaysTasks({ tasks, onTaskClick, onBrowseEngagements }: DashboardTodaysTasksProps) {
  const [tasksSearchQuery, setTasksSearchQuery] = useState('');
  const [tasksProjectFilter, setTasksProjectFilter] = useState<string[]>([]);

  const uniqueProjects = useMemo(
    () =>
      Array.from(
        new Map(tasks.map((t) => [t.projectId, { id: t.projectId, name: t.projectName }])).values()
      ),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (tasksSearchQuery.trim()) {
      const q = tasksSearchQuery.toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.projectName.toLowerCase().includes(q)
      );
    }
    if (tasksProjectFilter.length > 0) {
      result = result.filter((t) => tasksProjectFilter.includes(t.projectId));
    }
    return result;
  }, [tasks, tasksSearchQuery, tasksProjectFilter]);

  const hasTaskFilters = tasksProjectFilter.length > 0;

  const toggleTasksProjectFilter = (id: string) => {
    setTasksProjectFilter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div
      className="mb-4 sm:mb-6 rounded-xl border border-border bg-card overflow-hidden shadow-card"
      data-onboard="dashboard-todays-tasks"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-border">
        <h3 className="font-medium text-base text-foreground">Today&apos;s Tasks</h3>
        {tasks.length > 0 ? (
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search here..."
              value={tasksSearchQuery}
              onChange={(e) => setTasksSearchQuery(e.target.value)}
              className="pl-8 h-9 w-full sm:w-[200px] text-sm bg-muted/50"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Filter className="size-4" />
                Filter
                {hasTaskFilters && <span className="size-1.5 rounded-full bg-primary" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuCheckboxItem
                checked={tasksProjectFilter.length === 0}
                onCheckedChange={() => setTasksProjectFilter([])}
              >
                All projects
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {uniqueProjects.map((proj) => (
                <DropdownMenuCheckboxItem
                  key={proj.id}
                  checked={tasksProjectFilter.includes(proj.id)}
                  onCheckedChange={() => toggleTasksProjectFilter(proj.id)}
                >
                  {proj.name}
                </DropdownMenuCheckboxItem>
              ))}
              {hasTaskFilters && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTasksProjectFilter([])}>
                    Clear filter
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        ) : null}
      </div>
      <div className="divide-y divide-border">
        {tasks.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground space-y-3">
            <p>No open tasks right now.</p>
            {onBrowseEngagements ? (
              <Button type="button" variant="outline" size="sm" onClick={onBrowseEngagements}>
                Browse engagements
              </Button>
            ) : null}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No tasks match your search.
          </div>
        ) : (
          filteredTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onTaskClick?.(task)}
              className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors w-full text-left"
            >
              <span className="font-medium text-sm text-foreground">{task.name}</span>
              <div
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium',
                  projectColorMap[task.projectColor] ?? projectColorMap.blue
                )}
              >
                {task.projectName}
              </div>
              <span className="text-xs text-muted-foreground ml-auto">Due: {task.dueDate}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
