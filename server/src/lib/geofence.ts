import prisma from './prisma.js';

/**
 * Office attendance: device GPS vs firm office pin (500m fence).
 * Accuracy gate rejects only absurdly coarse fixes; distance is the real check.
 */
export const MKD_OFFICE_LAT = 13.0762097;
export const MKD_OFFICE_LNG = 80.2375391;
export const DEFAULT_GEOFENCE_RADIUS_M = 500;

/** Must stay in sync with client MAX_OFFICE_GPS_ACCURACY_M */
export const MAX_OFFICE_GPS_ACCURACY_M = 2500;

export class GeofenceError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'GeofenceError';
  }
}

export class GpsAccuracyError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'GpsAccuracyError';
  }
}

const EARTH_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in meters. */
export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * sinLng * sinLng;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Reject missing or absurdly coarse accuracy. Distance gate still enforces the 500m fence. */
export function assertOfficeGpsAccuracy(accuracyMeters: number | null | undefined): void {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
    throw new GpsAccuracyError(
      'Office check-in needs your device location. Allow location on your phone and try again.'
    );
  }
  if (accuracyMeters > MAX_OFFICE_GPS_ACCURACY_M) {
    throw new GpsAccuracyError(
      `Location accuracy is ±${Math.round(accuracyMeters)}m — too coarse to verify the office. Enable Precise Location and try again near a window.`
    );
  }
}

export async function resolveOfficeCheckIn(
  firmId: string,
  latitude: number,
  longitude: number,
  accuracyMeters?: number | null
): Promise<{ officeId: string; meters: number }> {
  assertOfficeGpsAccuracy(accuracyMeters);

  const offices = await prisma.office.findMany({
    where: { firmId },
    select: { id: true, name: true, latitude: true, longitude: true, geofenceRadius: true },
  });
  const pinned = offices.filter((o) => o.latitude != null && o.longitude != null);
  if (!pinned.length) {
    const created = await prisma.office.create({
      data: {
        firmId,
        name: 'M K Dandeker & Co LLP',
        address: 'M K Dandeker & Co LLP',
        latitude: MKD_OFFICE_LAT,
        longitude: MKD_OFFICE_LNG,
        geofenceRadius: DEFAULT_GEOFENCE_RADIUS_M,
      },
    });
    pinned.push(created);
  }

  let nearest = {
    office: pinned[0],
    meters: metersBetween(latitude, longitude, pinned[0].latitude!, pinned[0].longitude!),
  };
  for (const office of pinned.slice(1)) {
    const meters = metersBetween(latitude, longitude, office.latitude!, office.longitude!);
    if (meters < nearest.meters) nearest = { office, meters };
  }

  const radius = nearest.office.geofenceRadius || DEFAULT_GEOFENCE_RADIUS_M;
  if (nearest.meters > radius) {
    throw new GeofenceError(
      `You are ${Math.round(nearest.meters)}m from ${nearest.office.name}. Check-in is allowed within ${radius}m.`
    );
  }
  return { officeId: nearest.office.id, meters: nearest.meters };
}
