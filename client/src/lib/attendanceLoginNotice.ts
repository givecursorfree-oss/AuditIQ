export type LocationFailCode = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

export class LocationNeededError extends Error {
  code: LocationFailCode;
  constructor(code: LocationFailCode, message: string) {
    super(message);
    this.name = 'LocationNeededError';
    this.code = code;
  }
}

/** Plain-language status after login check-in fails. Login still succeeded. */
export function attendanceLoginNotice(err: unknown): {
  title: string;
  message: string;
  variant: 'warning' | 'error';
} {
  if (err instanceof LocationNeededError) {
    return {
      title: 'Signed in. Attendance not marked.',
      message:
        err.code === 'denied'
          ? 'Allow Precise Location on your phone, then check in at the office.'
          : `${err.message} Prefer checking in from Attendance on your phone.`,
      variant: 'warning',
    };
  }
  const raw = err instanceof Error ? err.message : '';
  if (/WFH requires manager/i.test(raw)) {
    return {
      title: 'Attendance not marked.',
      message: raw,
      variant: 'warning',
    };
  }
  if (/accuracy|Wi‑Fi|Wi-Fi|Precise Location|GPS within/i.test(raw)) {
    return {
      title: 'Signed in. GPS not precise enough.',
      message: `${raw}`,
      variant: 'warning',
    };
  }
  if (/within \d+m/i.test(raw) || /from .+\. Check-in/i.test(raw)) {
    return {
      title: 'Signed in. Outside the office zone.',
      message: `${raw} You can still use the app. Check in when you arrive at the office.`,
      variant: 'warning',
    };
  }
  return {
    title: 'Signed in. Attendance not marked.',
    message: raw || 'Check in from Attendance on your phone at the office (GPS).',
    variant: 'warning',
  };
}
