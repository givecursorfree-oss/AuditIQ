import type { User } from '../types';

export function isPrivilegedRole(role?: string): boolean {
  return role === 'Admin' || role === 'Partner';
}

export function canAccess(
  user: User | null | undefined,
  module: string,
  action = 'view'
): boolean {
  if (!user) return false;
  if (isPrivilegedRole(user.role)) return true;
  const keys = user.permissions ?? [];
  if (keys.includes('*')) return true;
  return keys.includes(`${module}:${action}`);
}
