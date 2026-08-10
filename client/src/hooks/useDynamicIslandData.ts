import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useGlobalChatOptional } from '@/context/GlobalChatContext';
import type {
  IslandNotificationPayload,
  IslandTimerPayload,
  IslandTodoPayload,
  IslandView,
} from '@/components/ui/dynamic-island';
import type { Notification } from '@/types';
import { notifyStopwatchChanged, STOPWATCH_CHANGED } from '@/lib/stopwatchEvents';
import { isTaskCompleted } from '@/lib/taskHighlight';

const STAFF_ROLES = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'];
const TASK_ROLES = ['Manager', 'Staff', 'Intern'];
const STOPWATCH_POLL_MS = 5000;
const NOTIF_POLL_MS = 30000;
const TOAST_TTL_MS = 8000;

interface StopwatchRow {
  id: string;
  workType: string;
  startedAt: string;
  isPaused?: boolean;
  elapsedSeconds?: number;
  engagement: { title: string; client: { name: string } } | null;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  engagement?: { id: string; title: string; client: { name: string } } | null;
}

function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function parseNotification(n: Notification): Omit<IslandNotificationPayload, 'onDismiss' | 'onOpen'> {
  const msg = n.message || '';
  const stageMatch = msg.match(/Stage updated to:\s*(.+)/i);
  const message = stageMatch ? stageMatch[0] : msg;
  const context = stageMatch
    ? msg.replace(stageMatch[0], '').replace(/^\s*—\s*|\s*—\s*$/g, '').trim() || n.title
    : n.title;

  return {
    id: n.id,
    senderName: n.title,
    senderInitials:
      n.title
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'N',
    context: context === n.title ? '' : context,
    message,
    timeLabel: fmtTime(n.createdAt),
  };
}

export function useDynamicIslandData() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const chat = useGlobalChatOptional();

  const [stopwatch, setStopwatch] = useState<StopwatchRow | null>(null);
  const [stoppingTimer, setStoppingTimer] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [flashNotifId, setFlashNotifId] = useState<string | null>(null);
  const [flashNotifBase, setFlashNotifBase] = useState<Omit<
    IslandNotificationPayload,
    'onDismiss' | 'onOpen'
  > | null>(null);

  const seenNotifIds = useRef<Set<string>>(new Set());
  const notifInit = useRef(false);
  const flashLinkRef = useRef<string | undefined>(undefined);

  const role = user?.role || '';
  const isStaff = STAFF_ROLES.includes(role);
  const showTasks = TASK_ROLES.includes(role);

  const loadStopwatch = useCallback(async () => {
    if (!isStaff) return;
    try {
      const { data } = await api.get<StopwatchRow | null>('/stopwatch/current');
      setStopwatch(data);
    } catch {
      setStopwatch(null);
    }
  }, [isStaff]);

  const stopTimer = useCallback(async () => {
    if (stoppingTimer) return;
    setStoppingTimer(true);
    try {
      await api.post('/stopwatch/stop', {});
      setStopwatch(null);
      notifyStopwatchChanged();
    } catch {
      await loadStopwatch();
    } finally {
      setStoppingTimer(false);
    }
  }, [stoppingTimer, loadStopwatch]);

  const loadTasks = useCallback(async () => {
    if (!showTasks) return;
    try {
      const { data } = await api.get<TaskRow[] | { tasks: TaskRow[] }>('/tasks?scope=mine');
      const list = Array.isArray(data) ? data : data.tasks || [];
      setTasks(list.filter((t) => !isTaskCompleted(t.status)));
    } catch {
      setTasks([]);
    }
  }, [showTasks]);

  const pollNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get<Notification[]>('/notifications');
      const unread = data.filter((n) => !n.isRead);
      if (!notifInit.current) {
        unread.forEach((n) => seenNotifIds.current.add(n.id));
        notifInit.current = true;
        return;
      }
      const fresh = unread.find((n) => !seenNotifIds.current.has(n.id));
      if (fresh) {
        seenNotifIds.current.add(fresh.id);
        flashLinkRef.current = fresh.link;
        setFlashNotifBase(parseNotification(fresh));
        setFlashNotifId(fresh.id);
        window.setTimeout(() => {
          setFlashNotifId(null);
          setFlashNotifBase(null);
        }, TOAST_TTL_MS);
      }
    } catch {
      /* silent */
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void loadStopwatch();
    void loadTasks();
    void pollNotifications();
    const onStopwatchChanged = () => void loadStopwatch();
    window.addEventListener(STOPWATCH_CHANGED, onStopwatchChanged);
    const sw = window.setInterval(() => void loadStopwatch(), STOPWATCH_POLL_MS);
    const tk = window.setInterval(() => void loadTasks(), 60000);
    const nf = window.setInterval(() => void pollNotifications(), NOTIF_POLL_MS);
    return () => {
      window.removeEventListener(STOPWATCH_CHANGED, onStopwatchChanged);
      window.clearInterval(sw);
      window.clearInterval(tk);
      window.clearInterval(nf);
    };
  }, [user, loadStopwatch, loadTasks, pollNotifications]);

  const dismissFlashNotif = useCallback(() => {
    setFlashNotifId(null);
    setFlashNotifBase(null);
  }, []);

  const openFlashNotif = useCallback(() => {
    const link = flashLinkRef.current;
    if (flashNotifId) {
      void api.patch(`/notifications/${flashNotifId}/read`);
    }
    dismissFlashNotif();
    if (link) navigate(link);
  }, [flashNotifId, dismissFlashNotif, navigate]);

  const chatToast = chat?.toasts[0];

  const chatNotification: IslandNotificationPayload | null = useMemo(() => {
    if (!chatToast) return null;
    return {
      id: chatToast.id,
      senderName: chatToast.senderName,
      senderInitials: chatToast.senderInitials,
      context: chatToast.roomName,
      message: chatToast.preview,
      timeLabel: chatToast.timeLabel,
      onDismiss: () => chat?.dismissToast(chatToast.id),
      onOpen: () => chat?.openFromToast(chatToast.id),
    };
  }, [
    chatToast?.id,
    chatToast?.senderName,
    chatToast?.senderInitials,
    chatToast?.roomName,
    chatToast?.preview,
    chatToast?.timeLabel,
    chat,
  ]);

  const flashNotification: IslandNotificationPayload | null = useMemo(() => {
    if (!flashNotifId || !flashNotifBase) return null;
    return {
      ...flashNotifBase,
      onDismiss: dismissFlashNotif,
      onOpen: openFlashNotif,
    };
  }, [flashNotifId, flashNotifBase, dismissFlashNotif, openFlashNotif]);

  const timerPayload: IslandTimerPayload | null = useMemo(() => {
    if (!stopwatch) return null;
    const client = stopwatch.engagement?.client.name || 'Client';
    const title = stopwatch.engagement?.title || 'Engagement';
    const work = stopwatch.workType;
    const subtitle =
      title.length > 28 ? `${client} · ${title.slice(0, 28)}…` : `${client} · ${title}`;
    return {
      startedAt: stopwatch.startedAt,
      subtitle: work ? `${subtitle} · ${work}` : subtitle,
      isPaused: Boolean(stopwatch.isPaused),
      elapsedSeconds: stopwatch.elapsedSeconds,
      stopping: stoppingTimer,
      onOpen: () => navigate('/time-tracker'),
      onStop: stopTimer,
    };
  }, [stopwatch, navigate, stopTimer, stoppingTimer]);

  const todoPayload: IslandTodoPayload | null = useMemo(() => {
    if (tasks.length === 0) return null;
    const top = tasks[0];
    const subtitle = top.engagement?.client.name;
    return {
      count: tasks.length,
      title: top.title,
      subtitle,
      onOpen: () => {
        const engId = top.engagement?.id;
        if (engId) navigate(`/engagements/${engId}?tab=documents&taskId=${top.id}`);
        else navigate('/time-tracker');
      },
    };
  }, [tasks, navigate]);

  const activeNotification = chatNotification ?? flashNotification;

  const view: IslandView = useMemo(() => {
    if (activeNotification) return 'notification';
    if (stopwatch) return 'timer';
    if (tasks.length > 0) return 'todo';
    return 'idle';
  }, [stopwatch, activeNotification, tasks.length]);

  const visible = view !== 'idle';

  return {
    view,
    visible,
    timer: timerPayload,
    notification: activeNotification,
    todo: todoPayload,
  };
}
