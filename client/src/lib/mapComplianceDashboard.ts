export interface ComplianceCalItem {
  id: string;
  title: string;
  dueDate: string;
  domain?: 'DT' | 'IDT';
  clientName?: string;
  status?: string;
}

export interface DashboardCompliancePayload {
  statutory: Array<{
    key: string;
    title: string;
    dueDate: string;
    daysAway?: number;
    rag?: string;
  }>;
  engagementDeadlines: Array<{
    id: string;
    title: string;
    dueDate: string;
    status: string;
    engagement: { id: string; title: string; client: { name: string } };
  }>;
  notices?: Array<{
    id: string;
    subject: string;
    portal: string;
    dueDate?: string | null;
    status?: string;
    client?: { name: string };
  }>;
}

const STATUTORY_DOMAIN: Record<string, 'DT' | 'IDT'> = {
  gstr1: 'IDT',
  gstr3b: 'IDT',
  tds: 'DT',
  roc: 'DT',
  itr: 'DT',
};

function portalDomain(portal: string): 'DT' | 'IDT' | undefined {
  if (portal === 'GST') return 'IDT';
  if (portal === 'Income_Tax' || portal === 'TRACES') return 'DT';
  return undefined;
}

function toIsoDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function mapComplianceDashboardToItems(
  payload: DashboardCompliancePayload | CalItem[] | null | undefined
): ComplianceCalItem[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const items: ComplianceCalItem[] = [];

  for (const s of payload.statutory ?? []) {
    const dueDate = toIsoDate(s.dueDate);
    if (!dueDate) continue;
    items.push({
      id: `statutory-${s.key}`,
      title: s.title,
      dueDate,
      domain: STATUTORY_DOMAIN[s.key],
      status: s.rag === 'green' ? 'on_track' : 'pending',
    });
  }

  for (const d of payload.engagementDeadlines ?? []) {
    const dueDate = toIsoDate(d.dueDate);
    if (!dueDate) continue;
    items.push({
      id: `deadline-${d.id}`,
      title: d.title,
      dueDate,
      clientName: d.engagement?.client?.name,
      status: d.status,
    });
  }

  for (const n of payload.notices ?? []) {
    if (!n.dueDate) continue;
    const dueDate = toIsoDate(n.dueDate);
    if (!dueDate) continue;
    items.push({
      id: `notice-${n.id}`,
      title: n.subject,
      dueDate,
      domain: portalDomain(n.portal),
      clientName: n.client?.name,
      status: n.status,
    });
  }

  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// Legacy alias for pages that import CalItem
export type CalItem = ComplianceCalItem;
