import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { isStaffPresenceRole } from '@/lib/presence';
/**
 * After login / session restore: set Available (online) and show attendance confirmation when applicable.
 */
export function LayoutSessionBootstrap() {
  const { user, loading } = useAuth();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (loading || !user?.id || bootstrapped) return;

    let cancelled = false;

    (async () => {
      if (isStaffPresenceRole(user.role)) {
        try {
          await api.patch('/presence/me', { status: 'online' });
          window.dispatchEvent(
            new CustomEvent('auditiq:presence-updated', { detail: { status: 'online' } })
          );
        } catch {
          /* server may have set on login */
        }
      }

      // Attendance clock-in happens on first engagement timer Start — not on session restore.

      if (!cancelled) setBootstrapped(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user?.id, user?.role, bootstrapped]);

  useEffect(() => {
    if (!user?.id) setBootstrapped(false);
  }, [user?.id]);

  return null;
}
