import { Link, useParams } from 'react-router-dom';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { EngagementLetterPanel } from '@/components/mkd/EngagementLetterPanel';

export default function EngagementLetterPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <AppPageContainer>
        <PageHeader title="Engagement letter" description="Invalid engagement" />
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer>
      <PageBreadcrumbs
        items={[
          { label: 'Engagements', to: '/engagements' },
          { label: 'Engagement', to: `/engagements/${id}` },
          { label: 'Engagement letter' },
        ]}
      />
      <PageHeader
        title="Engagement letter"
        description="Generate, send, and sign the MKD engagement letter before team assignment"
        actions={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to={`/engagements/${id}`}>Back to engagement</Link>
          </Button>
        }
      />
      <EngagementLetterPanel engagementId={id} />
    </AppPageContainer>
  );
}
