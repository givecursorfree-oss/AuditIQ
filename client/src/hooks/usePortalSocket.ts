import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';

export type PortalNotificationPayload = {
  title: string;
  message: string;
  link?: string;
  type?: 'info' | 'success' | 'warning';
};

function apiOrigin() {
  return (
    import.meta.env.VITE_API_URL ||
    (window.location.origin.includes('localhost:5173')
      ? 'http://localhost:3001'
      : window.location.origin)
  );
}

/**
 * Listens on the authenticated user's personal socket room for portal pushes
 * (e.g. an engagement letter being sent) so the UI refreshes without a manual reload.
 */
export function usePortalSocket(onNotification: (payload: PortalNotificationPayload) => void) {
  const { user } = useAuth();
  const handlerRef = useRef(onNotification);
  handlerRef.current = onNotification;

  useEffect(() => {
    if (!user) return;

    const socket: Socket = io(apiOrigin(), { withCredentials: true });
    const onPush = (payload: PortalNotificationPayload) => handlerRef.current?.(payload);
    socket.on('portal-notification', onPush);

    return () => {
      socket.off('portal-notification', onPush);
      socket.close();
    };
  }, [user?.id]);
}
