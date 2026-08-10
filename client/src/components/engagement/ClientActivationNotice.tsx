import { Clock, CheckCircle, UploadSimple as Upload, Users } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    icon: CheckCircle,
    title: 'Request received',
    description: 'Your engagement request is logged with the firm.',
  },
  {
    icon: Users,
    title: 'Team allocation',
    description: 'A Partner or Manager assigns Partner, Manager, or Article staff to your file.',
  },
  {
    icon: Upload,
    title: 'Uploads unlocked',
    description: 'You can upload documents, complete checklist items, and message the team.',
  },
] as const;

interface ClientActivationNoticeProps {
  variant?: 'banner' | 'card' | 'compact';
  className?: string;
  engagementName?: string;
}

export default function ClientActivationNotice({
  variant = 'banner',
  className,
  engagementName,
}: ClientActivationNoticeProps) {
  const headline = engagementName
    ? `${engagementName} is awaiting firm activation`
    : 'Your engagement is awaiting firm activation';

  if (variant === 'compact') {
    return (
      <p className={cn('text-sm text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2', className)}>
        <Clock size={16} className="inline mr-1.5 -mt-0.5" weight="fill" />
        {headline}. Document upload opens after the firm assigns your team — you do not need to contact anyone unless
        it has been more than 2 business days.
      </p>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-warning/25 bg-warning/5 p-4 sm:p-5 space-y-4',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
          <Clock size={22} weight="fill" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{headline}</h3>
          <p className="text-sm text-foreground-muted mt-1 leading-relaxed">
            Yes — the firm must accept and allocate your engagement before you can upload documents. This is
            intentional: your CA team reviews the request, assigns the right people, and then unlocks the client
            portal for file sharing.
          </p>
        </div>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className={cn(
              'rounded-lg border border-border bg-card/80 p-3',
              index === 1 && 'ring-1 ring-warning/30'
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <step.icon
                size={18}
                className={index === 1 ? 'text-warning' : 'text-primary'}
                weight={index === 0 ? 'fill' : 'regular'}
              />
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Step {index + 1}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">{step.title}</p>
            <p className="text-xs text-foreground-muted mt-1 leading-relaxed">{step.description}</p>
          </li>
        ))}
      </ol>

      <p className="text-xs text-foreground-muted">
        You will see the status change from <strong className="text-foreground">Pending Allocation</strong> to{' '}
        <strong className="text-foreground">In progress</strong>, and an assigned contact will appear on your
        engagement card.
      </p>
    </div>
  );
}
