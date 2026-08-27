export type LocationFailCode = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

export class LocationNeededError extends Error {
  code: LocationFailCode;
  constructor(code: LocationFailCode, message: string) {
    super(message);
    this.name = 'LocationNeededError';
    this.code = code;
  }
}

/** Shown only when attendance was not marked. Login still succeeded. */
export function attendanceLoginNotice(err: unknown): {
  title: string;
  message: string;
  variant: 'warning' | 'error';
} {
  if (err instanceof LocationNeededError) {
    if (err.code === 'denied') {
      return {
        title: 'Attendance not marked',
        message: 'Allow location, then check in at the office.',
        variant: 'warning',
      };
    }
    if (/accuracy|coarse|Precise/i.test(err.message)) {
      return {
        title: 'Attendance not marked',
        message: err.message,
        variant: 'warning',
      };
    }
    return {
      title: 'Attendance not marked',
      message: err.message,
      variant: 'warning',
    };
  }
  const raw = err instanceof Error ? err.message : '';
  if (/WFH requires manager/i.test(raw)) {
    return {
      title: 'Attendance not marked',
      message: raw,
      variant: 'warning',
    };
  }
  if (/accuracy|coarse|Precise Location/i.test(raw)) {
    return {
      title: 'Attendance not marked',
      message: raw,
      variant: 'warning',
    };
  }
  if (/outside the office|within \d+m|from .+\. Check-in/i.test(raw)) {
    return {
      title: 'Attendance not marked',
      message: 'You are outside the office check-in area. You can still use the app.',
      variant: 'warning',
    };
  }
  return {
    title: 'Attendance not marked',
    message: raw || 'Check in from Attendance at the office.',
    variant: 'warning',
  };
}
