import { useEffect, useState } from 'react';

import {

  BookOpen,

  Buildings,

  CaretDown,

  CaretRight,

  ClipboardText,

  FileText,

  Info,

  MapPin,

  Users,

} from '@phosphor-icons/react';

import api from '@/services/api';

import { WORKFLOW_DOMAIN_LABELS, type WorkflowDomain } from '@/lib/workflowCatalog';



type RequirementItem = {

  id: string;

  category: string;

  title: string;

  description: string;

  mandatory: boolean;

  surfaces: string[];

};



type ServiceDetail = {

  code: string;

  domain: WorkflowDomain;

  summary: string;

  authority: string;

  applicability: string;

  firmWillAsk: string[];

  byCategory: { category: string; label: string; items: RequirementItem[] }[];

  surfaces: { surface: string; label: string }[];

  checklistItems: { title: string; description?: string }[];

  internalTasks: { title: string; description: string; priority: string }[];

};



type SurfaceLabels = Record<string, string>;



type ServiceRequirementsPanelProps = {

  serviceCode: string;

  compact?: boolean;

  className?: string;

};



function ServiceRequirementsContent({

  serviceCode,

  compact,

  className,

}: Required<Pick<ServiceRequirementsPanelProps, 'serviceCode'>> &

  Pick<ServiceRequirementsPanelProps, 'compact' | 'className'>) {

  const [detail, setDetail] = useState<ServiceDetail | null>(null);

  const [surfaceLabels, setSurfaceLabels] = useState<SurfaceLabels>({});

  const [loading, setLoading] = useState(true);

  const [expanded, setExpanded] = useState(!compact);



  useEffect(() => {

    let cancelled = false;

    Promise.all([

      api.get<ServiceDetail>(`/workflow/services/${serviceCode}`),

      api.get<{ meta?: { appSurfaces?: SurfaceLabels } }>('/workflow/catalog').catch(() => ({

        data: { meta: undefined } as { meta?: { appSurfaces?: SurfaceLabels } },

      })),

    ])

      .then(([svcRes, catRes]) => {

        if (cancelled) return;

        setDetail(svcRes.data);

        setSurfaceLabels(catRes.data.meta?.appSurfaces ?? {});

      })

      .catch(() => {

        if (!cancelled) setDetail(null);

      })

      .finally(() => {

        if (!cancelled) setLoading(false);

      });

    return () => {

      cancelled = true;

    };

  }, [serviceCode]);



  if (loading) {

    return <p className={`text-sm text-foreground-muted ${className}`}>Loading requirement profile…</p>;

  }

  if (!detail) return null;



  const header = (

    <button

      type="button"

      onClick={() => setExpanded((e) => !e)}

      className="w-full flex items-center justify-between gap-2 text-left"

    >

      <div className="flex items-center gap-2 min-w-0">

        <ClipboardText size={18} className="text-primary shrink-0" />

        <div className="min-w-0">

          <p className="text-sm font-semibold text-foreground">What the firm will need</p>

          <p className="text-xs text-foreground-muted truncate">

            {WORKFLOW_DOMAIN_LABELS[detail.domain]} · {detail.checklistItems.length} checklist items auto-created

          </p>

        </div>

      </div>

      {compact ? (expanded ? <CaretDown size={16} /> : <CaretRight size={16} />) : null}

    </button>

  );



  if (compact && !expanded) {

    return <div className={`rounded-lg border border-border bg-surface/50 p-3 ${className}`}>{header}</div>;

  }



  return (

    <div className={`rounded-lg border border-border bg-surface/50 space-y-4 p-4 ${className}`}>

      {compact ? header : (

        <div className="flex items-start gap-2">

          <ClipboardText size={20} className="text-primary shrink-0 mt-0.5" />

          <div>

            <h4 className="text-sm font-semibold text-foreground">Requirement profile — MKD firm standard</h4>

            <p className="text-xs text-foreground-muted mt-0.5">{detail.summary}</p>

          </div>

        </div>

      )}



      <div className="grid gap-3 sm:grid-cols-2 text-xs">

        <div className="rounded-md border border-border/60 p-3 bg-card">

          <p className="font-medium text-foreground flex items-center gap-1.5 mb-1">

            <BookOpen size={14} /> Legal basis

          </p>

          <p className="text-foreground-muted leading-relaxed">{detail.authority}</p>

        </div>

        <div className="rounded-md border border-border/60 p-3 bg-card">

          <p className="font-medium text-foreground flex items-center gap-1.5 mb-1">

            <Info size={14} /> Applicability

          </p>

          <p className="text-foreground-muted leading-relaxed">{detail.applicability}</p>

        </div>

      </div>



      {detail.firmWillAsk.length > 0 && (

        <div>

          <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">

            <Users size={14} /> Questions the firm will ask at kick-off

          </p>

          <ul className="space-y-1.5 text-sm text-foreground-secondary">

            {detail.firmWillAsk.map((q) => (

              <li key={q} className="flex gap-2">

                <span className="text-primary shrink-0">•</span>

                <span>{q}</span>

              </li>

            ))}

          </ul>

        </div>

      )}



      {detail.byCategory.map((group) =>

        group.items.length > 0 ? (

          <div key={group.category}>

            <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">{group.label}</p>

            <ul className="space-y-2">

              {group.items.map((item) => (

                <li key={item.id} className="rounded-md border border-border/50 p-2.5 bg-card text-sm">

                  <div className="flex items-start justify-between gap-2">

                    <span className="font-medium text-foreground">{item.title}</span>

                    {item.mandatory && (

                      <span className="text-[10px] uppercase tracking-wide text-warning shrink-0">Required</span>

                    )}

                  </div>

                  <p className="text-xs text-foreground-muted mt-1 leading-relaxed">{item.description}</p>

                  {item.surfaces.length > 0 && (

                    <div className="flex flex-wrap gap-1 mt-2">

                      {item.surfaces.map((s) => (

                        <span

                          key={s}

                          className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground-muted"

                        >

                          <MapPin size={10} />

                          {surfaceLabels[s] ?? s}

                        </span>

                      ))}

                    </div>

                  )}

                </li>

              ))}

            </ul>

          </div>

        ) : null

      )}



      <div className="pt-2 border-t border-border">

        <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">

          <FileText size={14} /> Auto-created data checklist (on engagement create)

        </p>

        <div className="flex flex-wrap gap-1.5">

          {detail.checklistItems.map((c) => (

            <span key={c.title} className="text-xs px-2 py-1 rounded-full border border-border bg-card text-foreground-secondary">

              {c.title}

            </span>

          ))}

        </div>

      </div>



      <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-xs text-foreground-secondary leading-relaxed">

        <Buildings size={14} className="inline mr-1.5 text-primary" />

        <strong className="text-foreground">Where this lives in AuditIQ:</strong>{' '}

        {detail.surfaces.map((s) => s.label).join(' · ')}

      </div>

    </div>

  );

}



export function ServiceRequirementsPanel({ serviceCode, compact = false, className = '' }: ServiceRequirementsPanelProps) {

  if (!serviceCode) return null;

  return (

    <ServiceRequirementsContent

      key={serviceCode}

      serviceCode={serviceCode}

      compact={compact}

      className={className}

    />

  );

}

