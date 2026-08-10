import type { Step } from '@/components/ui/onboarding-checklist';
import { stepTargetExists } from '@/lib/tourSpotlight';

const TOUR_STATE_KEY = 'auditiq:product-tour:v1';
const TOUR_VERSION = 2;

export type ProductTourState = {
  version: number;
  completed: boolean;
  completedAt?: string;
  completedSteps: string[];
};

export function readTourState(): ProductTourState {
  try {
    const raw = localStorage.getItem(TOUR_STATE_KEY);
    if (!raw) {
      return { version: TOUR_VERSION, completed: false, completedSteps: [] };
    }
    const parsed = JSON.parse(raw) as ProductTourState;
    if (parsed.version !== TOUR_VERSION) {
      return { version: TOUR_VERSION, completed: false, completedSteps: [] };
    }
    return {
      version: TOUR_VERSION,
      completed: Boolean(parsed.completed),
      completedAt: parsed.completedAt,
      completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps : [],
    };
  } catch {
    return { version: TOUR_VERSION, completed: false, completedSteps: [] };
  }
}

function writeTourState(state: ProductTourState): void {
  try {
    localStorage.setItem(TOUR_STATE_KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
}

export function isTourCompletedOnDevice(): boolean {
  return readTourState().completed;
}

export function markTourCompleted(completedSteps: string[]): void {
  writeTourState({
    version: TOUR_VERSION,
    completed: true,
    completedAt: new Date().toISOString(),
    completedSteps,
  });
}

export function saveTourProgress(completedSteps: string[]): void {
  const prev = readTourState();
  if (prev.completed) return;
  writeTourState({
    ...prev,
    completedSteps,
  });
}

function resetTourOnDevice(): void {
  try {
    localStorage.removeItem(TOUR_STATE_KEY);
  } catch {
    /* ignore */
  }
}

/** Dispatch after resetTourOnDevice() to reopen the guide on the home dashboard. */
export const TOUR_REPLAY_EVENT = 'auditiq:tour-replay';

export function requestTourReplay(): void {
  resetTourOnDevice();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TOUR_REPLAY_EVENT));
  }
}

export function filterStepsWithTargets(steps: Step[]): Step[] {
  if (typeof document === 'undefined') return steps;
  return steps.filter((step) => stepTargetExists(step.targetSelector));
}

const STAFF_STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Your dashboard',
    description: 'Tasks due today, overdue items, and weekly deadlines at a glance.',
    targetSelector: "[data-onboard='dashboard-welcome']",
  },
  {
    id: 'priorities',
    title: 'What needs attention',
    description: 'One-click cards for approvals, client requests, at-risk engagements, and more.',
    targetSelector: "[data-onboard='dashboard-priorities']",
  },
  {
    id: 'action-queue',
    title: 'Action queue',
    description: 'Leadership: urgent firm-wide items surfaced in one queue.',
    targetSelector: "[data-onboard='dashboard-action-queue']",
  },
  {
    id: 'todays-tasks',
    title: "Today's tasks",
    description: 'Your open tasks stay visible here — even when the list is empty.',
    targetSelector: "[data-onboard='dashboard-todays-tasks']",
  },
  {
    id: 'stats',
    title: 'Key metrics',
    description: 'Live counts for engagements, clients, and workload — updated from your firm data.',
    targetSelector: "[data-onboard='dashboard-stats']",
  },
  {
    id: 'workflow',
    title: 'Workflow pipeline',
    description: 'Track DT, IDT, and audit engagements through compliance stages.',
    targetSelector: "[data-onboard='nav-workflow']",
  },
  {
    id: 'engagements',
    title: 'Engagements',
    description: 'Open any engagement for workpapers, team, timer, and stage history.',
    targetSelector: "[data-onboard='nav-engagements']",
  },
  {
    id: 'documents',
    title: 'Document library',
    description: 'Search inside PDFs and Office files. Sync from Google Drive when enabled.',
    targetSelector: "[data-onboard='nav-documents']",
  },
  {
    id: 'search',
    title: 'Quick search',
    description: 'Press / or use Search in the sidebar to find documents across the firm.',
    targetSelector: "[data-onboard='header-search'], [data-onboard='sidebar-search']",
  },
  {
    id: 'time',
    title: 'Time & attendance',
    description: 'Start timers per engagement; attendance is marked on your first timer start.',
    targetSelector: "[data-onboard='nav-time-tracker']",
  },
];

const ADMIN_EXTRA: Step[] = [
  {
    id: 'leave-manage',
    title: 'Leave management',
    description: 'Review and sanction leave requests — admins cannot apply for leave.',
    targetSelector: "[data-onboard='nav-leave-manage']",
  },
  {
    id: 'settings',
    title: 'Settings & permissions',
    description: 'Customize sidebar access per role. Changes apply in real time for your team.',
    targetSelector: "[data-onboard='nav-settings']",
  },
];

const CLIENT_STEPS: Step[] = [
  {
    id: 'client-welcome',
    title: 'Your client portal',
    description: 'Track engagements with your CA firm, upload documents, and message your team.',
    targetSelector: "[data-onboard='client-portal-header']",
  },
  {
    id: 'client-priorities',
    title: 'What needs your attention',
    description: 'Uploads, audit queries, and letters to sign — one tap to the right tab.',
    targetSelector: "[data-onboard='client-priorities']",
  },
  {
    id: 'client-request',
    title: 'Request an engagement',
    description: 'Submit a new audit or tax engagement request directly to your CA firm.',
    targetSelector: "[data-onboard='client-request-engagement']",
  },
  {
    id: 'client-summary',
    title: 'Engagement summary',
    description: 'Active, completed, and pending document requests in one place.',
    targetSelector: "[data-onboard='client-summary']",
  },
  {
    id: 'client-empty',
    title: 'No engagements yet?',
    description: 'Use Request a New Engagement — your firm will assign a team once approved.',
    targetSelector: "[data-onboard='client-empty-welcome']",
  },
  {
    id: 'client-tracking',
    title: 'Progress tracking',
    description: 'Follow audit stages and see what your firm is working on right now.',
    targetSelector: "[data-onboard='client-tab-tracking']",
  },
  {
    id: 'client-documents',
    title: 'Documents',
    description: 'Upload files your auditor requested and download shared deliverables.',
    targetSelector: "[data-onboard='client-tab-documents']",
  },
  {
    id: 'client-queries',
    title: 'Audit queries',
    description: 'Respond to questions from your engagement team without email chains.',
    targetSelector: "[data-onboard='client-tab-queries']",
  },
  {
    id: 'client-messages',
    title: 'Messages',
    description: 'Chat securely with your CA firm from the sidebar.',
    targetSelector: "[data-onboard='nav-client-messages']",
  },
];

export function getTourStepsForRole(role: string | undefined): Step[] {
  if (!role) return [];
  if (role === 'Client') return CLIENT_STEPS;

  const steps = [...STAFF_STEPS];
  if (role === 'Admin' || role === 'Partner') {
    steps.push(...ADMIN_EXTRA);
  }
  if (role === 'Manager') {
    steps.push({
      id: 'leave-manage',
      title: 'Leave management',
      description: 'Approve team leave requests before final partner sanction.',
      targetSelector: "[data-onboard='nav-leave-manage']",
    });
  }
  if (role === 'Partner' || role === 'Manager' || role === 'Staff') {
    steps.push({
      id: 'leave-apply',
      title: 'Apply for leave',
      description: 'Submit ICAI-compliant leave; managers review before final approval.',
      targetSelector: "[data-onboard='nav-leave-apply']",
    });
  }
  if (role === 'Intern') {
    steps.push({
      id: 'stipend',
      title: 'Stipend & e-diary',
      description: 'View stipend records and export your ICAI e-diary from Leave & Stipend.',
      targetSelector: "[data-onboard='nav-stipend']",
    });
  }
  return steps;
}

export function isTourHomePath(pathname: string, role: string | undefined): boolean {
  if (role === 'Client') return pathname === '/client/dashboard' || pathname === '/portal';
  return pathname === '/' || pathname === '/dashboard';
}

/** Map nav catalog ids → data-onboard attribute values */
export const NAV_ONBOARD_ATTR: Record<string, string> = {
  dashboard: 'nav-dashboard',
  workflow: 'nav-workflow',
  'workflow-board': 'nav-workflow-board',
  services: 'nav-services',
  engagements: 'nav-engagements',
  clients: 'nav-clients',
  workpapers: 'nav-workpapers',
  documents: 'nav-documents',
  approvals: 'nav-approvals',
  'time-tracker': 'nav-time-tracker',
  attendance: 'nav-attendance',
  'leave-apply': 'nav-leave-apply',
  'leave-manage': 'nav-leave-manage',
  stipend: 'nav-stipend',
  employees: 'nav-employees',
  messages: 'nav-messages',
  reports: 'nav-reports',
  billing: 'nav-billing',
  'management-reports': 'nav-management-reports',
  vault: 'nav-vault',
  settings: 'nav-settings',
  'client-dashboard': 'client-portal-home',
  'client-messages': 'nav-client-messages',
};
