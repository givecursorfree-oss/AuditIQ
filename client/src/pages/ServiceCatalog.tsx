import { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass as Search, ClipboardText, CaretRight } from '@phosphor-icons/react';
import api from '@/services/api';
import PageHeader from '@/components/layout/PageHeader';
import PageLoading from '@/components/layout/PageLoading';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { ServiceRequirementsPanel } from '@/components/engagement/ServiceRequirementsPanel';
import { WORKFLOW_DOMAIN_LABELS, type WorkflowDomain } from '@/lib/workflowCatalog';

type CatalogService = {
  code: string;
  domain: WorkflowDomain;
  name: string;
  dueRule?: string;
  recurrence?: string;
  summary?: string;
  authority?: string;
  applicability?: string;
  firmWillAsk?: string[];
  requirementCount?: number;
  clientDocumentCount?: number;
};

const DOMAIN_TABS: (WorkflowDomain | 'ALL')[] = ['ALL', 'DT', 'IDT', 'AUDIT'];

export default function ServiceCatalog() {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState<WorkflowDomain | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api
      .get<{ services: CatalogService[] }>('/workflow/catalog')
      .then(({ data }) => {
        setServices(data.services ?? []);
        setLoadError('');
      })
      .catch((err: unknown) => {
        console.error(err);
        const ax = err as { response?: { data?: { error?: string } } };
        setLoadError(ax.response?.data?.error || 'Could not load service catalog. Try refreshing the page.');
        setServices([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (domain !== 'ALL' && s.domain !== domain) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.summary ?? '').toLowerCase().includes(q) ||
        (s.authority ?? '').toLowerCase().includes(q)
      );
    });
  }, [services, domain, search]);

  useEffect(() => {
    if (filtered.length > 0 && !selectedCode) setSelectedCode(filtered[0].code);
    if (selectedCode && !filtered.find((s) => s.code === selectedCode) && filtered[0]) {
      setSelectedCode(filtered[0].code);
    }
  }, [filtered, selectedCode]);

  const selected = filtered.find((s) => s.code === selectedCode) ?? null;

  return (
    <AppPageContainer>
      <PageHeader
        title="Service Catalog"
        description="MKD practice services — what the firm needs from clients, where it lives in AuditIQ, and checklist items auto-created per engagement."
      />

      <div className="flex flex-col lg:flex-row gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services, acts, requirements…"
            aria-label="Search services"
            className="input-field pl-9 w-full"
          />
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1 flex-wrap">
          {DOMAIN_TABS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDomain(d)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                domain === d ? 'bg-card text-foreground shadow-sm' : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              {d === 'ALL' ? 'All practice areas' : WORKFLOW_DOMAIN_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {loadError}
        </div>
      )}

      {loading ? (
        <PageLoading className="h-48" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {filtered.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => setSelectedCode(s.code)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  selectedCode === s.code
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-card hover:border-primary/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{s.name}</p>
                    <p className="text-[10px] text-foreground-muted mt-0.5">
                      {WORKFLOW_DOMAIN_LABELS[s.domain]}
                      {s.dueRule ? ` · ${s.dueRule}` : ''}
                    </p>
                  </div>
                  <CaretRight size={14} className="shrink-0 text-foreground-muted mt-1" />
                </div>
                {s.summary && (
                  <p className="text-xs text-foreground-muted mt-2 line-clamp-2 leading-relaxed">{s.summary}</p>
                )}
                <div className="flex gap-2 mt-2 text-[10px] text-foreground-muted">
                  {s.clientDocumentCount != null && <span>{s.clientDocumentCount} client docs</span>}
                  {s.requirementCount != null && <span>{s.requirementCount} requirements</span>}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-foreground-muted text-center py-8">No services match your search.</p>
            )}
          </div>

          <div className="min-w-0">
            {selected ? (
              <div className="space-y-4">
                <div className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardText size={20} className="text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2>
                  </div>
                  {selected.summary && (
                    <p className="text-sm text-foreground-secondary leading-relaxed">{selected.summary}</p>
                  )}
                </div>
                <ServiceRequirementsPanel serviceCode={selected.code} />
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">Select a service to view requirements.</p>
            )}
          </div>
        </div>
      )}
    </AppPageContainer>
  );
}
