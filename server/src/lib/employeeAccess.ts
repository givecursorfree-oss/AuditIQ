import { hasPermissionKey, type PermissionKey } from './permissions.js';

export function isSelfOnlyEmployeeRole(role: string): boolean {
  return role === 'Staff' || role === 'Intern';
}

export function canViewSensitiveEmployeeData(role: string, keys: PermissionKey[]): boolean {
  if (['Partner', 'Admin', 'HR'].includes(role)) return true;
  return (
    hasPermissionKey(keys, 'employees', 'manage') || hasPermissionKey(keys, 'employees', 'edit')
  );
}

export function canDownloadEmployeeDocument(
  role: string,
  keys: PermissionKey[],
  viewerId: string,
  employeeUserId: string
): boolean {
  if (viewerId === employeeUserId) return true;
  if (isSelfOnlyEmployeeRole(role)) return false;
  return canViewSensitiveEmployeeData(role, keys);
}
