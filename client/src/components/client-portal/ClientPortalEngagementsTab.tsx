import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EngagementProgressStepper } from '@/components/engagement/EngagementProgressStepper';
import ClientActivationNotice from '@/components/engagement/ClientActivationNotice';
import {
  CLIENT_STAGE_DESCRIPTIONS,
  getClientProgressStepIndex,
  getClientProgressStepLabels,
} from '@/lib/engagementProgress';
import { useGlobalChatOptional } from '@/context/GlobalChatContext';
import { Briefcase, Warning, CheckCircle } from '@phosphor-icons/react';
import { useClientPortal } from './ClientPortalContext';

export function ClientPortalEngagementsTab() {
  const globalChat = useGlobalChatOptional();
  const {
    engagements,
    setSelectedEngagementId,
    setUploadEngagementId,
    setActiveTab,
  } = useClientPortal();

  return (
    <div className="mt-4 space-y-4">
      {engagements.map((e) => (
        <Card key={e.id} className="overflow-hidden">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Briefcase size={18} className="text-primary" />
                  {e.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {e.referenceNo && <>Ref: {e.referenceNo} · </>}
                  Submitted {e.submittedAt ? new Date(e.submittedAt).toLocaleDateString('en-IN') : '—'}
                </p>
              </div>
              {e.needsClientAction ? (
                <Badge variant="destructive" className="bg-warning/15 text-warning border-warning/30 gap-1">
                  <Warning size={12} weight="fill" className="shrink-0" />
                  Action required
                </Badge>
              ) : e.isActivated ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle size={12} weight="fill" className="shrink-0" />
                  In progress
                </Badge>
              ) : (
                <Badge variant="outline">Pending Allocation</Badge>
              )}
            </div>

            <EngagementProgressStepper
              currentStage={e.currentStage}
              stepIndex={e.progressStep ?? getClientProgressStepIndex(e.currentStage, e.workflowDomain)}
              stepLabels={e.progressSteps ?? getClientProgressStepLabels(e.workflowDomain)}
              stageDescription={
                e.stageDescription ||
                CLIENT_STAGE_DESCRIPTIONS[e.currentStage] ||
                'Your engagement is in progress.'
              }
            />

            {e.partnerInCharge && (
              <p className="text-xs text-muted-foreground">
                Assigned to: <strong className="text-foreground">{e.partnerInCharge.name}</strong> (
                {e.partnerInCharge.designation})
              </p>
            )}
            {e.isActivated && (e.pendingDocuments ?? 0) > 0 && (
              <p className="text-xs text-warning">Documents pending from you: {e.pendingDocuments}</p>
            )}

            {!e.isActivated && <ClientActivationNotice variant="compact" engagementName={e.name} />}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedEngagementId(e.id);
                  setActiveTab('tracking');
                }}
              >
                View Details
              </Button>
              {e.isActivated && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setUploadEngagementId(e.id);
                      setActiveTab('documents');
                    }}
                  >
                    Upload Documents
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => globalChat?.openMessagesPage()}>
                    Message Team
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
