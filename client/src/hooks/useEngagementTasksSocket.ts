import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import { resolveApiOrigin } from '@/lib/apiBase';

export type TaskCompletedPayload = {
  engagementId: string;
  taskId: string;
  title: string;
  completedById: string;
  completedByName?: string;
  createdById?: string | null;
};

/** Join engagement room and listen for task lifecycle events */
export function useEngagementTasksSocket(
  engagementId: string | undefined,
  onTaskCompleted?: (payload: TaskCompletedPayload) => void
) {
  const { user } = useAuth();
  const handlerRef = useRef(onTaskCompleted);
  handlerRef.current = onTaskCompleted;

  useEffect(() => {
    if (!engagementId || !user) return;

    const socket: Socket = io(resolveApiOrigin(), { withCredentials: true });

    const onCompleted = (payload: TaskCompletedPayload) => {
      handlerRef.current?.(payload);
    };

    socket.on('task-completed', onCompleted);
    socket.emit(
      'join-engagement',
      { engagementId, user: { name: `${user.firstName} ${user.lastName}`.trim() } },
      () => {}
    );

    return () => {
      socket.emit('leave-engagement', {
        engagementId,
        user: { name: `${user.firstName} ${user.lastName}`.trim() },
      });
      socket.off('task-completed', onCompleted);
      socket.close();
    };
  }, [engagementId, user?.id, user?.firstName, user?.lastName]);
}
