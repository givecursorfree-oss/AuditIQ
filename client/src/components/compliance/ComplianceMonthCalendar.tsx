interface CalItem {
  id: string;
  title: string;
  dueDate: string;
  status?: string;
}

interface Props {
  month: Date;
  onMonthChange: (d: Date) => void;
  items: CalItem[];
  onDateClick: (isoDate: string) => void;
}

function colorForItem(item: CalItem, today: Date): string {
  const due = new Date(item.dueDate);
  due.setHours(0, 0, 0, 0);
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  if (item.status === 'filed' || item.status === 'Completed') return 'bg-success/20 border-success/40';
  const diff = (due.getTime() - t.getTime()) / 86400000;
  if (diff < 0) return 'bg-destructive/15 border-destructive/40';
  if (diff <= 7) return 'bg-warning/20 border-warning/40';
  return 'bg-muted/30';
}

export default function ComplianceMonthCalendar({ month, onMonthChange, items, onDateClick }: Props) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDow = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const today = new Date();

  const byDate = new Map<string, CalItem[]>();
  for (const item of items) {
    const key = item.dueDate.slice(0, 10);
    const list = byDate.get(key) || [];
    list.push(item);
    byDate.set(key, list);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          className="text-sm px-2 py-1 border rounded"
          onClick={() => onMonthChange(new Date(year, m - 1, 1))}
        >
          Prev
        </button>
        <div className="font-medium">
          {month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </div>
        <button
          type="button"
          className="text-sm px-2 py-1 border rounded"
          onClick={() => onMonthChange(new Date(year, m + 1, 1))}
        >
          Next
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} />;
          const iso = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayItems = byDate.get(iso) || [];
          const accent = dayItems[0] ? colorForItem(dayItems[0], today) : 'bg-background border-border';
          return (
            <button
              key={iso}
              type="button"
              onClick={() => dayItems.length && onDateClick(iso)}
              className={`min-h-[52px] rounded border p-1 text-left text-xs ${accent} ${dayItems.length ? 'cursor-pointer' : ''}`}
            >
              <div className="font-medium">{day}</div>
              {dayItems.length > 0 && (
                <div className="text-[10px] text-muted-foreground">{dayItems.length} due</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
