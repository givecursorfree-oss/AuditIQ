import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { InteractiveOnboardingChecklist } from '@/components/ui/onboarding-checklist';
import Confetti from '@/components/ui/confetti';
import {
  filterStepsWithTargets,
  getTourStepsForRole,
  isTourCompletedOnDevice,
  isTourHomePath,
  markTourCompleted,
  readTourState,
  saveTourProgress,
  TOUR_REPLAY_EVENT,
} from '@/lib/productTour';

const AUTO_START_DELAY_MS = 500;

type TourStep = ReturnType<typeof getTourStepsForRole>[number];

type TourState = {
  open: boolean;
  celebrate: boolean;
  steps: TourStep[];
  completedSteps: string[];
  tourDone: boolean;
};

type TourAction =
  | { type: 'set_open'; open: boolean }
  | { type: 'set_steps'; steps: TourStep[] }
  | { type: 'set_completed'; ids: string[] }
  | { type: 'complete'; ids: string[] }
  | { type: 'replay' };

function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'set_open':
      return { ...state, open: action.open };
    case 'set_steps':
      return { ...state, steps: action.steps };
    case 'set_completed':
      return { ...state, completedSteps: action.ids };
    case 'complete':
      return {
        ...state,
        completedSteps: action.ids,
        tourDone: true,
        celebrate: true,
      };
    case 'replay':
      return {
        ...state,
        tourDone: false,
        completedSteps: [],
        celebrate: false,
      };
    default:
      return state;
  }
}

function initialTourState(): TourState {
  return {
    open: false,
    celebrate: false,
    steps: [],
    completedSteps: readTourState().completedSteps,
    tourDone: isTourCompletedOnDevice(),
  };
}

export default function ProductTourHost() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const [state, dispatch] = useReducer(tourReducer, undefined, initialTourState);

  const role = user?.role;
  const onHome = isTourHomePath(pathname, role);

  const catalogSteps = useMemo(() => getTourStepsForRole(role), [role]);

  const resolveSteps = useCallback(() => {
    const available = filterStepsWithTargets(catalogSteps);
    const steps = available.length > 0 ? available : catalogSteps.slice(0, 3);
    dispatch({ type: 'set_steps', steps });
  }, [catalogSteps]);

  useEffect(() => {
    if (!user || loading) return;
    resolveSteps();
  }, [user, loading, pathname, resolveSteps]);

  useEffect(() => {
    if (!user || loading || !onHome) return;
    if (state.tourDone || isTourCompletedOnDevice()) return;

    const timer = window.setTimeout(() => {
      resolveSteps();
      dispatch({ type: 'set_open', open: true });
    }, AUTO_START_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [user, loading, onHome, resolveSteps, state.tourDone]);

  useEffect(() => {
    const onReplay = () => {
      dispatch({ type: 'replay' });
      resolveSteps();
      if (onHome) dispatch({ type: 'set_open', open: true });
    };
    window.addEventListener(TOUR_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, onReplay);
  }, [onHome, resolveSteps]);

  const isClient = role === 'Client';
  const firstName = user?.firstName?.trim() || 'there';

  const tourTitle = isClient ? 'Client portal guide' : 'Product guide';
  const tourSubtitle = isClient
    ? 'Track engagements, share documents, and message your CA firm.'
    : 'A quick walkthrough on this browser — one time per device.';

  const welcomeOnComplete = isClient
    ? {
        title: `Welcome, ${firstName}`,
        message:
          'Your client portal is ready. Track engagement progress, upload documents, respond to audit queries, and message your CA firm — all in one place.',
        actionLabel: 'Enter portal',
      }
    : {
        title: `You're set, ${firstName}`,
        message:
          'Use What needs your attention and Today\'s tasks on the dashboard. Tap Product guide anytime to replay this walkthrough.',
        actionLabel: 'Start working',
      };

  if (!user || state.steps.length === 0) return null;

  return (
    <>
      <Confetti isActive={state.celebrate} duration={4200} zIndex={74} />
      <InteractiveOnboardingChecklist
        open={state.open}
        onOpenChange={(open) => dispatch({ type: 'set_open', open })}
        steps={state.steps}
        initialCompletedSteps={state.completedSteps}
        title={tourTitle}
        subtitle={tourSubtitle}
        welcomeOnComplete={welcomeOnComplete}
        onStepComplete={(_id, ids) => {
          dispatch({ type: 'set_completed', ids });
          saveTourProgress(ids);
        }}
        completedOnDevice={state.tourDone}
        onComplete={(ids) => {
          markTourCompleted(ids);
          dispatch({ type: 'complete', ids });
        }}
      />
    </>
  );
}
