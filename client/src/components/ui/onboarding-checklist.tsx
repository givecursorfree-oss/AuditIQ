import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSidebar } from '@/components/ui/sidebar';
import {
  delay,
  expandTourTargetAncestors,
  findTourTarget,
  hasSidebarTourTarget,
  measureTourTarget,
  type SpotlightRect,
} from '@/lib/tourSpotlight';

export interface Step {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
}

export interface TourWelcomeConfig {
  title: string;
  message: string;
  actionLabel?: string;
}

interface InteractiveOnboardingChecklistProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Step[];
  initialCompletedSteps?: string[];
  title?: string;
  subtitle?: string;
  onStepComplete?: (stepId: string, completedIds: string[]) => void;
  onComplete?: (completedIds: string[]) => void;
  welcomeOnComplete?: TourWelcomeConfig | null;
  /** When true, hide the reopen FAB (tour finished on this device). */
  completedOnDevice?: boolean;
  className?: string;
}

const tourBtn =
  'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:pointer-events-none';

function StepIndicator({ done, index }: { done: boolean; index: number }) {
  return (
    <span
      className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums',
        done
          ? 'bg-neutral-900 text-white'
          : 'border border-border bg-background text-muted-foreground'
      )}
      aria-hidden
    >
      {done ? '✓' : index + 1}
    </span>
  );
}

export function InteractiveOnboardingChecklist(props: InteractiveOnboardingChecklistProps) {
  const seedKey = [...new Set(props.initialCompletedSteps ?? [])].sort().join(',');
  return <InteractiveOnboardingChecklistInner key={seedKey} {...props} />;
}

function InteractiveOnboardingChecklistInner({
  open,
  onOpenChange,
  steps,
  initialCompletedSteps = [],
  title = 'Getting started',
  subtitle = 'Explore key features on this device',
  onStepComplete,
  onComplete,
  welcomeOnComplete,
  completedOnDevice = false,
  className,
}: InteractiveOnboardingChecklistProps) {
  const { isMobile, openMobile, setOpenMobile, open: sidebarOpen, setOpen: setSidebarOpen, state } =
    useSidebar();
  const [completedSteps, setCompletedSteps] = useState<string[]>(() =>
    [...new Set(initialCompletedSteps.filter((id) => steps.some((s) => s.id === id)))]
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [coachmarksEnabled, setCoachmarksEnabled] = useState(true);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const sidebarSnapshotRef = useRef<{
    openedMobile: boolean;
    expandedDesktop: boolean;
    prevMobile: boolean;
    prevOpen: boolean;
  } | null>(null);
  const prepareTokenRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const [measuredPanelClearance, setMeasuredPanelClearance] = useState(280);

  const validCompletedSteps = useMemo(
    () => [...new Set(completedSteps.filter((id) => steps.some((s) => s.id === id)))],
    [completedSteps, steps]
  );

  const firstIncompleteStepId = useMemo(() => {
    const firstIncomplete = steps.find((s) => !validCompletedSteps.includes(s.id));
    return firstIncomplete?.id ?? steps[0]?.id ?? null;
  }, [steps, validCompletedSteps]);

  const activeStepId = open ? (selectedStepId ?? firstIncompleteStepId) : null;
  const panelClearance = open && isMobile ? measuredPanelClearance : 280;

  const activeStep = useMemo(
    () => (activeStepId ? steps.find((s) => s.id === activeStepId) ?? null : null),
    [steps, activeStepId]
  );

  const progress = steps.length
    ? Math.min(100, Math.round((validCompletedSteps.length / steps.length) * 100))
    : 0;
  const allDone = steps.length > 0 && validCompletedSteps.length >= steps.length;

  const restoreSidebarForTour = useCallback(() => {
    const snap = sidebarSnapshotRef.current;
    if (!snap) return;
    if (snap.openedMobile) setOpenMobile(snap.prevMobile);
    if (snap.expandedDesktop) setSidebarOpen(snap.prevOpen);
    sidebarSnapshotRef.current = null;
  }, [setOpenMobile, setSidebarOpen]);

  const prepareTourTarget = useCallback(
    async (selector: string) => {
      if (findTourTarget(selector)) return;

      if (!hasSidebarTourTarget(selector)) return;

      if (!sidebarSnapshotRef.current) {
        sidebarSnapshotRef.current = {
          openedMobile: false,
          expandedDesktop: false,
          prevMobile: openMobile,
          prevOpen: sidebarOpen,
        };
      }

      if (isMobile && !openMobile) {
        setOpenMobile(true);
        sidebarSnapshotRef.current.openedMobile = true;
        await delay(240);
        return;
      }

      if (!isMobile && state === 'collapsed') {
        setSidebarOpen(true);
        sidebarSnapshotRef.current.expandedDesktop = true;
        await delay(200);
      }

      await expandTourTargetAncestors(selector);
    },
    [isMobile, openMobile, setOpenMobile, sidebarOpen, setSidebarOpen, state]
  );

  const refreshSpotlight = useCallback(
    async (step: Step | null) => {
      if (!step || !coachmarksEnabled || !open) {
        setSpotlight(null);
        return;
      }

      const token = ++prepareTokenRef.current;
      await prepareTourTarget(step.targetSelector);
      if (token !== prepareTokenRef.current) return;

      const rect = measureTourTarget(step.targetSelector);
      setSpotlight(rect);

      const el = findTourTarget(step.targetSelector);
      el?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    },
    [coachmarksEnabled, open, prepareTourTarget]
  );

  useEffect(() => {
    if (open) return;
    restoreSidebarForTour();
  }, [open, restoreSidebarForTour]);

  useEffect(() => {
    void refreshSpotlight(activeStep);
  }, [activeStep, refreshSpotlight]);

  /** Keep floating coachmarks above the Product guide panel on mobile. */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !open || !isMobile) return;
    const update = () => {
      const height = panel.getBoundingClientRect().height;
      setMeasuredPanelClearance(Math.ceil(height) + 20);
    };
    const ro = new ResizeObserver(update);
    ro.observe(panel);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [open, isMobile, validCompletedSteps.length, coachmarksEnabled, activeStepId]);

  useEffect(() => {
    if (!open || !activeStep || !coachmarksEnabled) return;

    const onLayout = () => void refreshSpotlight(activeStep);
    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);
    const interval = window.setInterval(onLayout, 500);

    return () => {
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
      window.clearInterval(interval);
    };
  }, [open, activeStep, coachmarksEnabled, refreshSpotlight]);

  const finishTour = useCallback(
    (ids: string[]) => {
      const normalized = steps.map((s) => s.id);
      const finalIds = normalized.length > 0 ? normalized : ids;
      setCompletedSteps(finalIds);
      onComplete?.(finalIds);
      onOpenChange(false);
      setSpotlight(null);
      setSelectedStepId(null);
      restoreSidebarForTour();
      if (welcomeOnComplete) {
        setWelcomeOpen(true);
      }
    },
    [onComplete, onOpenChange, restoreSidebarForTour, steps, welcomeOnComplete]
  );

  useEffect(() => {
    if (!open || steps.length === 0 || !allDone || completedOnDevice) return;
    finishTour(validCompletedSteps);
  }, [allDone, completedOnDevice, finishTour, open, steps.length, validCompletedSteps]);

  const markStepDone = (stepId: string) => {
    setCompletedSteps((prev) => {
      if (prev.includes(stepId)) return prev;
      const next = [...new Set([...prev.filter((id) => steps.some((s) => s.id === id)), stepId])];
      onStepComplete?.(stepId, next);
      if (next.length >= steps.length) {
        finishTour(next);
      }
      return next;
    });
  };

  const handleStepClick = (step: Step) => {
    setSelectedStepId(step.id);
    if (coachmarksEnabled) void refreshSpotlight(step);
  };

  const handleNext = () => {
    if (!activeStep) return;
    if (validCompletedSteps.includes(activeStep.id)) {
      const idx = steps.findIndex((s) => s.id === activeStep.id);
      const next = steps[idx + 1];
      if (next) setSelectedStepId(next.id);
      else if (validCompletedSteps.length >= steps.length) finishTour(validCompletedSteps);
      return;
    }
    markStepDone(activeStep.id);
    const idx = steps.findIndex((s) => s.id === activeStep.id);
    const next = steps[idx + 1];
    if (next) setSelectedStepId(next.id);
  };

  /** Closing the guide marks the full tour complete on this device. */
  const handleDismiss = () => {
    finishTour(steps.map((s) => s.id));
  };

  const stepPosition = activeStep ? steps.findIndex((s) => s.id === activeStep.id) + 1 : 0;

  const mobileCoachmarkStyle = isMobile
    ? {
        bottom: `calc(${panelClearance}px + env(safe-area-inset-bottom, 0px))`,
        left: 16,
        right: 16,
        maxWidth: 'none' as const,
      }
    : undefined;

  const coachmarkContent = activeStep ? (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{activeStep.title}</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{activeStep.description}</p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-lg leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
          Step {stepPosition} of {steps.length}
        </span>
        <button type="button" className={cn(tourBtn, 'h-8 px-3 text-xs')} onClick={handleNext}>
          {validCompletedSteps.includes(activeStep.id)
            ? stepPosition >= steps.length
              ? 'Finish'
              : 'Next'
            : 'Got it'}
        </button>
      </div>
    </>
  ) : null;

  return (
    <>
      <AnimatePresence>
        {open && coachmarksEnabled && activeStep && spotlight && (
          <m.div
            key="spotlight-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] pointer-events-none"
            aria-hidden
          >
            <div
              className="absolute rounded-md ring-2 ring-neutral-900 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] transition-all duration-200"
              style={{
                top: spotlight.top,
                left: spotlight.left,
                width: spotlight.width,
                height: spotlight.height,
              }}
            />
            <m.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'pointer-events-auto absolute z-[61] rounded-xl border border-border bg-card p-3.5 shadow-xl',
                !isMobile && 'max-w-xs'
              )}
              style={
                isMobile
                  ? mobileCoachmarkStyle
                  : {
                      top: Math.min(spotlight.top + spotlight.height + 10, window.innerHeight - 160),
                      left: Math.min(Math.max(12, spotlight.left), window.innerWidth - 300),
                    }
              }
            >
              {coachmarkContent}
            </m.div>
          </m.div>
        )}
        {open && coachmarksEnabled && activeStep && !spotlight && (
          <m.div
            key="coachmark-fallback"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] bg-black/40 pointer-events-auto"
          >
            <m.div
              className={cn(
                'absolute z-[61] rounded-xl border border-border bg-card p-3.5 shadow-xl',
                !isMobile && 'bottom-28 right-4 w-[min(100vw-2rem,20rem)]'
              )}
              style={mobileCoachmarkStyle}
            >
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Feature highlight
              </p>
              {coachmarkContent}
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <div
            ref={panelRef}
            className={cn(
              'fixed z-[70] w-[min(100vw-2rem,21rem)]',
              isMobile
                ? 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 max-h-[min(42vh,18rem)]'
                : 'bottom-6 right-4',
              className
            )}
          >
          <m.div
            key="checklist-panel"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-border shadow-xl">
              <CardHeader className="pb-2.5 space-y-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <CardTitle className="text-[15px] font-semibold tracking-tight">{title}</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">{subtitle}</CardDescription>
                  </div>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-lg leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Close guide"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                    <span>{progress}%</span>
                    <span>
                      {validCompletedSteps.length}/{steps.length}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <m.div
                      className="h-full rounded-full bg-neutral-900"
                      initial={false}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5 pt-0">
                <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
                  <Label htmlFor="coachmarks-toggle" className="text-xs font-medium cursor-pointer">
                    Highlight features
                  </Label>
                  <Switch
                    id="coachmarks-toggle"
                    checked={coachmarksEnabled}
                    onCheckedChange={(checked) => {
                      setCoachmarksEnabled(checked);
                      if (!checked) setSpotlight(null);
                      else if (activeStep) void refreshSpotlight(activeStep);
                    }}
                    className="data-[state=checked]:bg-neutral-900"
                  />
                </div>

                <ul
                  className={cn(
                    'space-y-0.5 overflow-y-auto pr-0.5',
                    isMobile ? 'max-h-[min(22vh,9rem)]' : 'max-h-[min(36vh,14rem)]'
                  )}
                >
                  {steps.map((step, index) => {
                    const done = validCompletedSteps.includes(step.id);
                    const isActive = activeStepId === step.id;
                    return (
                      <li key={step.id}>
                        <button
                          type="button"
                          onClick={() => handleStepClick(step)}
                          className={cn(
                            'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                            isActive && 'bg-neutral-100 ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700',
                            !isActive && 'hover:bg-muted/50'
                          )}
                        >
                          <StepIndicator done={done} index={index} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-foreground">{step.title}</span>
                            <span className="block text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                              {step.description}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {allDone ? (
                  <p className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-center text-[11px] text-muted-foreground">
                    {completedOnDevice
                      ? 'Guide complete. Tap Product guide below anytime to review.'
                      : 'All steps done — closing guide…'}
                  </p>
                ) : (
                  <button
                    type="button"
                    className={cn(tourBtn, 'h-9 w-full text-sm')}
                    onClick={handleNext}
                    disabled={!activeStep}
                  >
                    {activeStep && validCompletedSteps.includes(activeStep.id) ? 'Continue' : 'Continue'}
                  </button>
                )}
              </CardContent>
            </Card>
          </m.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!open && steps.length > 0 && !welcomeOpen && (
          <m.div
            key="tour-fab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-20 right-4 z-[55] sm:bottom-6"
          >
            <button
              type="button"
              className={cn(
                tourBtn,
                'h-10 rounded-full px-4 text-xs shadow-md',
                allDone && 'bg-neutral-700 hover:bg-neutral-600'
              )}
              onClick={() => onOpenChange(true)}
              data-tour-fab
            >
              Product guide
            </button>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {welcomeOpen && welcomeOnComplete && (
          <m.div
            key="welcome-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4"
          >
            <m.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl text-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby="tour-welcome-title"
            >
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Welcome
              </p>
              <h2 id="tour-welcome-title" className="mt-2 text-xl font-semibold text-foreground">
                {welcomeOnComplete.title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {welcomeOnComplete.message}
              </p>
              <button
                type="button"
                className={cn(tourBtn, 'mt-5 h-10 w-full')}
                onClick={() => setWelcomeOpen(false)}
              >
                {welcomeOnComplete.actionLabel ?? 'Get started'}
              </button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
