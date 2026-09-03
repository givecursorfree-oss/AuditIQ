import { appShortcutRows, modKeyLabel } from '@/lib/keyboardShortcuts';
import { cn } from '@/lib/utils';

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsPanel({ className }: { className?: string }) {
  const rows = appShortcutRows(modKeyLabel());
  const scopes = [...new Set(rows.map((r) => r.scope))];

  return (
    <div className={cn('space-y-5', className)}>
      {scopes.map((scope) => (
        <div key={scope}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{scope}</h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rows
              .filter((r) => r.scope === scope)
              .map((r) => (
                <li key={`${scope}-${r.action}-${r.keys.join('+')}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-sm text-foreground">{r.action}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {r.keys.map((k, i) => (
                      <span key={`${k}-${i}`} className="flex items-center gap-1">
                        {i > 0 ? <span className="text-muted-foreground text-[10px]">+</span> : null}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
