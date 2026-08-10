import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { scopesForPath, type NavBadges } from '../lib/navBadgeMap';

/**
 * When the user opens a page, acknowledge that nav area so red dots clear
 * until new activity arrives.
 */
export function useNavAttentionOnRoute(refresh: () => Promise<void>) {
  const { user } = useAuth();
  const location = useLocation();
  const lastAckRef = useRef<string>('');

  useEffect(() => {
    if (!user) return;

    const scopes = scopesForPath(location.pathname);
    if (scopes.length === 0) return;

    const key = `${location.pathname}:${scopes.join(',')}`;
    if (lastAckRef.current === key) return;
    lastAckRef.current = key;

    void api
      .post<{ badges: NavBadges }>('/nav-badges/ack', { scopes })
      .then(() => refresh())
      .catch(() => {
        lastAckRef.current = '';
      });
  }, [location.pathname, user?.id, refresh]);
}
