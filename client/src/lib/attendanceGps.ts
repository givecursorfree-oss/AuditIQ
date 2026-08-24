/**
 * Precise device GPS for Office attendance.
 * Uses high-accuracy geolocation (GPS on phones). Rejects coarse Wi‑Fi/IP-style fixes.
 * Not IP-based — browsers report lat/lng from the device location stack.
 */
import { LocationNeededError, type LocationFailCode } from './attendanceLoginNotice';

/** Must stay in sync with server MAX_OFFICE_GPS_ACCURACY_M */
export const MAX_OFFICE_GPS_ACCURACY_M = 100;

export type GpsFix = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS desktop UA with touch
  return navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua);
}

function toFix(pos: GeolocationPosition): GpsFix {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracyMeters: pos.coords.accuracy || 0,
  };
}

/**
 * Wait for a GPS-grade fix (accuracy ≤ 100m). Prefers phone GPS.
 * maximumAge: 0 — never reuse a cached Wi‑Fi position.
 */
export function getPreciseGps(options?: {
  maxAccuracyM?: number;
  waitMs?: number;
}): Promise<GpsFix> {
  const maxAccuracy = options?.maxAccuracyM ?? MAX_OFFICE_GPS_ACCURACY_M;
  const waitMs = options?.waitMs ?? 28_000;

  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reject(
        new LocationNeededError(
          'unavailable',
          'Location needs HTTPS (or localhost). Open AuditIQ on your phone via the secure site URL.'
        )
      );
      return;
    }
    if (!navigator.geolocation) {
      reject(
        new LocationNeededError(
          'unsupported',
          'This browser cannot share GPS. Open AuditIQ on your phone to check in at the office.'
        )
      );
      return;
    }

    let best: GpsFix | null = null;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        /* ignore */
      }
      fn();
    };

    const onGood = (fix: GpsFix) => {
      if (!best || fix.accuracyMeters < best.accuracyMeters) best = fix;
      if (fix.accuracyMeters > 0 && fix.accuracyMeters <= maxAccuracy) {
        finish(() => resolve(fix));
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => onGood(toFix(pos)),
      (err) => {
        // Keep watching unless permission denied
        if (err.code === 1) {
          finish(() =>
            reject(
              new LocationNeededError(
                'denied',
                'Location permission is off. On your phone: allow Precise Location for the browser, then try again.'
              )
            )
          );
        }
      },
      { enableHighAccuracy: true, timeout: waitMs, maximumAge: 0 }
    );

    const timer = setTimeout(() => {
      finish(() => {
        if (best && best.accuracyMeters > 0 && best.accuracyMeters <= maxAccuracy) {
          resolve(best);
          return;
        }
        if (best && best.accuracyMeters > maxAccuracy) {
          reject(
            new LocationNeededError(
              'unavailable',
              `Got ±${Math.round(best.accuracyMeters)}m (likely Wi‑Fi, not GPS). Need within ±${maxAccuracy}m. Use your phone at the office with Precise Location on.`
            )
          );
          return;
        }
        const code: LocationFailCode = 'timeout';
        reject(
          new LocationNeededError(
            code,
            isLikelyMobileDevice()
              ? 'GPS timed out. Step near a window or outdoors, keep Precise Location on, and try again.'
              : 'Desktop location is usually Wi‑Fi/IP and is not accepted. Open AuditIQ on your phone at the office to check in.'
          )
        );
      });
    }, waitMs);
  });
}
