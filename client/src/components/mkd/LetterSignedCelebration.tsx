import { Link } from 'react-router-dom';
import { m } from 'motion/react';
import { CheckCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { teamAssignmentPath } from '@/lib/teamAssignmentRoutes';

export function LetterSignedCelebration({
  engagementId,
  siblingCount = 1,
}: {
  engagementId: string;
  siblingCount?: number;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-6 text-center space-y-4"
    >
      <m.div
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.05 }}
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15"
      >
        <CheckCircle size={36} weight="fill" className="text-emerald-500" />
      </m.div>
      <div>
        <h3 className="text-lg font-semibold text-foreground">Engagement letter signed</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {siblingCount > 1
            ? `Team assignment is unlocked for all ${siblingCount} linked engagements.`
            : 'Team assignment is now unlocked for this engagement.'}
        </p>
      </div>
      <Button type="button" asChild>
        <Link to={teamAssignmentPath(engagementId)}>Assign team →</Link>
      </Button>
    </m.div>
  );
}
