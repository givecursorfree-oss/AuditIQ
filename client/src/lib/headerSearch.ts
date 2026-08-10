import api from '@/services/api';

export type HeaderSearchResultType = 'engagement' | 'document' | 'client';

export interface HeaderSearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: HeaderSearchResultType;
  route: string;
}

const LIMITS = { documents: 4, engagements: 3, clients: 3 } as const;

/** Quick search across documents, engagements, and clients. */
export async function performHeaderSearch(query: string): Promise<HeaderSearchResult[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  const [docRes, engRes, clientRes] = await Promise.allSettled([
    api.get('/search/documents', { params: { q, limit: LIMITS.documents }, timeout: 12000 }),
    api.get('/engagements', { params: { search: q, limit: LIMITS.engagements, page: 1 }, timeout: 8000 }),
    api.get('/clients', { params: { search: q, limit: LIMITS.clients, page: 1 }, timeout: 8000 }),
  ]);

  const results: HeaderSearchResult[] = [];

  if (docRes.status === 'fulfilled') {
    const docHits = docRes.value.data?.results || [];
    for (const d of docHits) {
      results.push({
        id: d.id,
        title: d.title,
        subtitle: d.highlight || d.subtitle || 'Document',
        type: 'document',
        route: '/documents',
      });
    }
  }

  if (engRes.status === 'fulfilled') {
    const engagements = engRes.value.data?.engagements || [];
    for (const e of engagements) {
      results.push({
        id: e.id,
        title: e.title,
        subtitle: e.client?.name ? `${e.client.name} · ${e.type || 'Engagement'}` : 'Engagement',
        type: 'engagement',
        route: `/engagements/${e.id}`,
      });
    }
  }

  if (clientRes.status === 'fulfilled') {
    const clients = clientRes.value.data?.clients || [];
    for (const c of clients) {
      results.push({
        id: c.id,
        title: c.name,
        subtitle: [c.pan, c.cin].filter(Boolean).join(' · ') || 'Client',
        type: 'client',
        route: '/clients',
      });
    }
  }

  return results;
}
