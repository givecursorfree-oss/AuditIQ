export type PresenceStatus = 'online' | 'offline' | 'maintenance' | 'degraded';

export type AvatarPresenceVariant = 'online' | 'offline' | 'busy' | 'away';

export const PRESENCE_STATUSES: PresenceStatus[] = [
  'online',
  'degraded',
  'maintenance',
  'offline',
];

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: 'Available',
  offline: 'Offline',
  maintenance: 'Away',
  degraded: 'Busy',
};

const STAFF_PRESENCE_ROLES = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'] as const;

export function isStaffPresenceRole(role: string): boolean {
  return STAFF_PRESENCE_ROLES.includes(role as (typeof STAFF_PRESENCE_ROLES)[number]);
}

export function normalizePresenceStatus(value?: string | null): PresenceStatus {
  if (
    value === 'online' ||
    value === 'offline' ||
    value === 'maintenance' ||
    value === 'degraded'
  ) {
    return value;
  }
  return 'online';
}

/** Map Status badge values to AvatarStatus dot variants */
export function presenceToAvatarVariant(status: PresenceStatus): AvatarPresenceVariant {
  switch (status) {
    case 'offline':
      return 'offline';
    case 'maintenance':
      return 'away';
    case 'degraded':
      return 'busy';
    default:
      return 'online';
  }
}

export type StaffPresenceEntry = {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  role: string;
  designation?: string | null;
  presenceStatus: PresenceStatus;
  presenceUpdatedAt?: string | null;
};
