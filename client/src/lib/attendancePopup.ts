import api from '../services/api';
import { todayKey } from './chatHelpers';

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
    methodLabel: 'Sign-out check-out',
    kind: 'check-out',
  };
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

/**
 * Records check-in and shows confirmation (including when already checked in today).
 */
export async function tryAttendanceCheckIn(
  userId: string,
  method: AttendanceMethod,
  options?: { skipIfAlreadyDone?: boolean; forcePopup?: boolean }
): Promise<AttendancePopupDetails | null> {
  const skipApiIfDone = options?.skipIfAlreadyDone ?? method !== 'manual';
  const forcePopup = options?.forcePopup ?? method === 'manual-login';
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
      return showPopup(buildCheckInPopup(existing, method));
    }
    return null;
  }

  try {
    const { data } = await api.post<{ checkIn?: string; status?: string }>(
      '/attendance/check-in',
      { method }
    );
    sessionStorage.setItem(apiKey, 'done');
    return showPopup(buildCheckInPopup(data, method));
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 400) {
      sessionStorage.setItem(apiKey, 'done');
      const existing = await fetchTodayAttendanceRecord();
      if (existing && !existing.checkOut) {
        return showPopup(buildCheckInPopup(existing, method));
      }
    }
    return null;
  }
}

/** Records check-out on logout (no duplicate popup if already out). */
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
