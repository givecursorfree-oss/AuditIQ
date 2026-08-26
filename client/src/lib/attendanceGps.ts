/**
 * Device GPS for Office attendance vs firm office pin.
 * Prefers a tight fix; accepts urban phone GPS up to MAX (not IP-only absurd radii).
 */
import { LocationNeededError, type LocationFailCode } from './attendanceLoginNotice';

/** Early-accept threshold — good phone GPS. */
export const PREFERRED_OFFICE_GPS_ACCURACY_M = 500;

/**
 * Hard reject above this. Indoor urban GPS often reports 200–2000m even at the office.
 * Must stay in sync with server MAX_OFFICE_GPS_ACCURACY_M.
 */
export const MAX_OFFICE_GPS_ACCURACY_M = 2500;

export type GpsFix = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
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
 * Wait for the best GPS fix. Accepts preferred accuracy early; otherwise best within MAX.
 */
export function getPreciseGps(options?: {
  maxAccuracyM?: number;
  preferredAccuracyM?: number;
  waitMs?: number;
}): Promise<GpsFix> {
  const maxAccuracy = options?.maxAccuracyM ?? MAX_OFFICE_GPS_ACCURACY_M;
  const preferred = options?.preferredAccuracyM ?? PREFERRED_OFFICE_GPS_ACCURACY_M;
  const waitMs = options?.waitMs ?? 20_000;

  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reject(
        new LocationNeededError(
          'unavailable',
          'Location needs HTTPS. Open AuditIQ on your phone via the secure site URL.'
        )
      );
      return;
    }
    if (!navigator.geolocation) {
      reject(
        new LocationNeededError(
          'unsupported',
          'This browser cannot share GPS. Open AuditIQ on your phone at the office.'
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
      if (fix.accuracyMeters > 0 && fix.accuracyMeters <= preferred) {
        finish(() => resolve(fix));
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => onGood(toFix(pos)),
      (err) => {
        if (err.code === 1) {
          finish(() =>
            reject(
              new LocationNeededError(
                'denied',
                'Location permission is off. Allow location for the browser, then try again.'
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
              `Location accuracy is ±${Math.round(best.accuracyMeters)}m — too coarse to verify the office. Enable Precise Location, step near a window, and try again.`
            )
          );
          return;
        }
        const code: LocationFailCode = 'timeout';
        reject(
          new LocationNeededError(
            code,
            isLikelyMobileDevice()
              ? 'Could not get a GPS fix. Step near a window, keep location on, and try again.'
              : 'Desktop location is often inaccurate. Check in from your phone at the office.'
          )
        );
      });
    }, waitMs);
  });
}
