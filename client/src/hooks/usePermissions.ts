import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { canAccess, isPrivilegedRole } from '../lib/permissions';

export function usePermissions() {
  const { user } = useAuth();

  return useMemo(
    () => ({
      user,
      isPrivileged: isPrivilegedRole(user?.role),
      can: (module: string, action = 'view') => canAccess(user, module, action),
    }),
    [user]
  );
}
