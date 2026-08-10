import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import { PageBreadcrumbs } from '../components/layout/PageBreadcrumbs';
import { PanelCard } from '../components/layout/PanelCard';
import PageHeader from '../components/layout/PageHeader';
import PageLoading from '../components/layout/PageLoading';

export default function NoticeDetail() {
  const { id } = useParams<{ id: string }>();
  const [notice, setNotice] = useState<{
    subject: string;
    portal: string;
    noticeType: string;
    status: string;
    dueDate?: string;
    client: { name: string };
    engagement?: { id: string; title: string } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void api
      .get(`/notices/${id}`)
      .then((r) => setNotice(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <AppPageContainer>
        <PageBreadcrumbs items={[{ label: 'Notices', to: '/notices' }, { label: 'Notice' }]} />
        <PageLoading className="h-40" />
      </AppPageContainer>
    );
  }

  if (!notice) {
    return (
      <AppPageContainer>
        <PageBreadcrumbs items={[{ label: 'Notices', to: '/notices' }, { label: 'Notice' }]} />
        <PageHeader title="Notice unavailable" description="This notice could not be loaded." />
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer>
      <PageBreadcrumbs
        items={[
          { label: 'Notices', to: '/notices' },
          { label: notice.subject.length > 48 ? `${notice.subject.slice(0, 48)}…` : notice.subject },
        ]}
      />
      <PageHeader title={notice.subject} description={`${notice.portal} · ${notice.noticeType}`} />
      <PanelCard>
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Client</dt>
            <dd>{notice.client.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{notice.status}</dd>
          </div>
          {notice.dueDate && (
            <div>
              <dt className="text-muted-foreground">Due</dt>
              <dd>{new Date(notice.dueDate).toLocaleDateString('en-IN')}</dd>
            </div>
          )}
          {notice.engagement && (
            <div>
              <dt className="text-muted-foreground">Engagement</dt>
              <dd>
                <Link to={`/engagements/${notice.engagement.id}`} className="text-primary underline">
                  {notice.engagement.title}
                </Link>
              </dd>
            </div>
          )}
        </dl>
        <p className="text-xs text-muted-foreground mt-4">
          Portal sync uses stored credentials. External API integration is pending.
        </p>
      </PanelCard>
    </AppPageContainer>
  );
}
