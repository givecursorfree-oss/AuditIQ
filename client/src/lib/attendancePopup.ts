import api from '../services/api';
import { todayKey } from './chatHelpers';
import { LocationNeededError, type LocationFailCode } from './attendanceLoginNotice';
import { getPreciseGps, isLikelyMobileDevice, type GpsFix } from './attendanceGps';

export { LocationNeededError, attendanceLoginNotice } from './attendanceLoginNotice';
export type { LocationFailCode } from './attendanceLoginNotice';
export { getPreciseGps, isLikelyMobileDevice, MAX_OFFICE_GPS_ACCURACY_M } from './attendanceGps';
export type { GpsFix } from './attendanceGps';

const ATTENDANCE_AUTO_ROLES = ['Partner', 'Admin', 'Manager', 'Staff', 'Intern'] as const;

type AttendanceMethod = 'auto-dashboard' | 'manual' | 'manual-login';

export type AttendancePopupDetails = {
  checkIn: string;
  status: string;
  dateTime: string;
  methodLabel: string;
  kind?: 'check-in' | 'check-out';
};

const METHOD_LABELS: Record<AttendanceMethod, string> = {
  'auto-dashboard': 'Auto check-in · Session',
  manual: 'Manual check-in',
  'manual-login': 'Sign-in check-in',
};

export function isAttendanceEligible(role: string): boolean {
  return ATTENDANCE_AUTO_ROLES.includes(role as (typeof ATTENDANCE_AUTO_ROLES)[number]);
}

function attendanceApiKey(userId: string): string {
  return `auditiq-attendance-api-${userId}-${todayKey()}`;
}

function attendancePopupShownKey(userId: string): string {
  return `auditiq-attendance-popup-shown-${userId}-${todayKey()}`;
}

function formatCheckInTime(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime() {
  return new Date().toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildCheckInPopup(
  data: { checkIn?: string; status?: string },
  method: AttendanceMethod
): AttendancePopupDetails {
  return {
    checkIn: formatCheckInTime(data.checkIn),
    status: (data.status || 'present').toUpperCase(),
    dateTime: formatDateTime(),
    methodLabel: METHOD_LABELS[method],
    kind: 'check-in',
  };
}

function buildCheckOutPopup(data: { checkOut?: string; checkIn?: string }): AttendancePopupDetails {
  return {
    checkIn: formatCheckInTime(data.checkOut || data.checkIn),
    status: 'CHECKED OUT',
    dateTime: formatDateTime(),
    methodLabel: 'Attendance check-out',
    kind: 'check-out',
  };
}

async function locationPermissionState(): Promise<PermissionState | 'unknown'> {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

/** @deprecated use getPreciseGps — kept for any callers expecting single-shot */
export function getBrowserGps(): Promise<GpsFix> {
  return getPreciseGps();
}

/**
 * Confirm + acquire precise GPS for Office check-in (phone recommended).
 */
export async function requestAttendanceLocation(options?: {
  confirm: (input: {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }) => Promise<boolean>;
}): Promise<GpsFix> {
  if (!navigator.geolocation) {
    throw new LocationNeededError(
      'unsupported',
      'This browser cannot share GPS. Open AuditIQ on your phone to check in at the office.'
    );
  }

  const state = await locationPermissionState();
  if (state === 'denied') {
    throw new LocationNeededError(
      'denied',
      'Location permission is off. On your phone: allow Precise Location for the browser, then try again.'
    );
  }

  if (state !== 'granted' && options?.confirm) {
    const onPhone = isLikelyMobileDevice();
    const allowed = await options.confirm({
      title: 'Allow Precise Location',
      message: onPhone
        ? 'AuditIQ uses your phone GPS coordinates (not Wi‑Fi/IP) and checks you are at the office. Turn on Precise Location, then Allow.'
        : 'Office check-in needs device GPS coordinates (not Wi‑Fi/IP). Desktop location is often rejected — prefer your phone at the office. Tap Allow, then Allow in the browser prompt.',
      confirmLabel: 'Allow GPS',
      cancelLabel: 'Not now',
    });
    if (!allowed) {
      throw new LocationNeededError(
        'denied',
        'Location permission is off. You are signed in, but attendance is not marked.'
      );
    }
  }

  return getPreciseGps();
}

async function fetchTodayAttendanceRecord(): Promise<{
  checkIn?: string;
  checkOut?: string;
  status?: string;
} | null> {
  try {
    const { data } = await api.get<{ checkIn?: string; checkOut?: string; status?: string }>(
      '/attendance/me/today'
    );
    if (!data?.checkIn) return null;
    return data;
  } catch {
    return null;
  }
}

export function markAttendancePopupShown(userId: string) {
  sessionStorage.setItem(attendancePopupShownKey(userId), '1');
}

function dispatchAttendanceConfirmed(details: AttendancePopupDetails) {
  window.dispatchEvent(
    new CustomEvent('auditiq:attendance-confirmed', { detail: details })
  );
}

export type PlaceOfWork = 'Office' | 'Client Place' | 'Work from Home';

/**
 * Records check-in once per day. Office = precise GPS vs office pin.
 * App attendance replaces Google Form; Bio is HR cross-verify separately.
 */
export async function tryAttendanceCheckIn(
  userId: string,
  method: AttendanceMethod,
  options?: {
    skipIfAlreadyDone?: boolean;
    forcePopup?: boolean;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    /** If true, do not prompt GPS again — caller already tried. */
    gpsAttempted?: boolean;
    placeOfWork?: PlaceOfWork;
    clientName?: string;
  }
): Promise<AttendancePopupDetails | null> {
  const skipApiIfDone = options?.skipIfAlreadyDone ?? true;
  const forcePopup = options?.forcePopup ?? method === 'manual-login';
  const placeOfWork = options?.placeOfWork ?? 'Office';
  const apiKey = attendanceApiKey(userId);
  const popupKey = attendancePopupShownKey(userId);

  if (!forcePopup && sessionStorage.getItem(popupKey)) {
    return null;
  }

  const showPopup = (details: AttendancePopupDetails) => {
    if (!forcePopup && sessionStorage.getItem(popupKey)) return null;
    sessionStorage.setItem(popupKey, '1');
    dispatchAttendanceConfirmed(details);
    return details;
  };

  if (skipApiIfDone && sessionStorage.getItem(apiKey)) {
    const existing = await fetchTodayAttendanceRecord();
    if (existing && !existing.checkOut) {
      return forcePopup ? showPopup(buildCheckInPopup(existing, method)) : null;
    }
    return null;
  }

  const existing = await fetchTodayAttendanceRecord();
  if (existing?.checkIn && !existing.checkOut) {
    sessionStorage.setItem(apiKey, 'done');
    return forcePopup ? showPopup(buildCheckInPopup(existing, method)) : null;
  }

  const needsGps = placeOfWork === 'Office';
  if (
    needsGps &&
    (options?.latitude == null || options?.longitude == null || options?.accuracyMeters == null)
  ) {
    if (options?.gpsAttempted) {
      throw new LocationNeededError(
        'unavailable',
        'Could not get precise GPS. Use your phone at the office with Precise Location on.'
      );
    }
  }

  let gps: { latitude?: number; longitude?: number; accuracyMeters?: number } = {};
  if (needsGps) {
    if (
      options?.latitude != null &&
      options?.longitude != null &&
      options?.accuracyMeters != null
    ) {
      gps = {
        latitude: options.latitude,
        longitude: options.longitude,
        accuracyMeters: options.accuracyMeters,
      };
    } else {
      const fix = await getPreciseGps();
      gps = {
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyMeters: fix.accuracyMeters,
      };
    }
  } else if (options?.latitude != null && options?.longitude != null) {
    gps = {
      latitude: options.latitude,
      longitude: options.longitude,
      accuracyMeters: options.accuracyMeters,
    };
  }

  try {
    const { data } = await api.post<{
      checkIn?: string;
      status?: string;
      alreadyCheckedIn?: boolean;
      lateBand?: string;
    }>('/attendance/check-in', {
      method,
      placeOfWork,
      clientName: options?.clientName,
      ...gps,
    });
    sessionStorage.setItem(apiKey, 'done');
    if (data.alreadyCheckedIn && !forcePopup) return null;
    return showPopup(buildCheckInPopup(data, method));
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    const serverMsg = (err as { response?: { data?: { error?: string } } })?.response?.data
      ?.error;
    if (status === 400) {
      // Don't treat GPS accuracy failures as "already checked in"
      if (/accuracy|GPS|Precise|Wi‑Fi|Wi-Fi|phone/i.test(serverMsg || '')) {
        throw new Error(serverMsg || 'Check-in failed');
      }
      sessionStorage.setItem(apiKey, 'done');
      const today = await fetchTodayAttendanceRecord();
      if (today && !today.checkOut) {
        return forcePopup ? showPopup(buildCheckInPopup(today, method)) : null;
      }
    }
    throw new Error(serverMsg || (err as Error).message || 'Check-in failed');
  }
}

/** Manual attendance check-out (Attendance page). Not called on app logout. */
export async function tryAttendanceCheckOut(userId: string): Promise<boolean> {
  try {
    const today = await fetchTodayAttendanceRecord();
    if (!today?.checkIn || today.checkOut) return false;

    const { data } = await api.post<{ checkOut?: string; checkIn?: string }>(
      '/attendance/check-out'
    );
    dispatchAttendanceConfirmed(buildCheckOutPopup(data));
    return true;
  } catch {
    return false;
  }
}
