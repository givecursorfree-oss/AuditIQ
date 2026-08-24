import { describe, expect, it } from 'vitest';
import {
  assertOfficeGpsAccuracy,
  GpsAccuracyError,
  MAX_OFFICE_GPS_ACCURACY_M,
  metersBetween,
  MKD_OFFICE_LAT,
  MKD_OFFICE_LNG,
} from '../geofence.js';

describe('metersBetween', () => {
  it('is ~0 for the same point', () => {
    expect(metersBetween(MKD_OFFICE_LAT, MKD_OFFICE_LNG, MKD_OFFICE_LAT, MKD_OFFICE_LNG)).toBeLessThan(1);
  });

  it('treats 500m as inside a 500m fence for a nearby offset', () => {
    // ~111m per 0.001° latitude
    const meters = metersBetween(MKD_OFFICE_LAT, MKD_OFFICE_LNG, MKD_OFFICE_LAT + 0.004, MKD_OFFICE_LNG);
    expect(meters).toBeGreaterThan(400);
    expect(meters).toBeLessThan(500);
  });
});

describe('assertOfficeGpsAccuracy', () => {
  it('accepts phone-grade GPS accuracy', () => {
    expect(() => assertOfficeGpsAccuracy(25)).not.toThrow();
    expect(() => assertOfficeGpsAccuracy(MAX_OFFICE_GPS_ACCURACY_M)).not.toThrow();
  });

  it('rejects missing or Wi‑Fi/IP-style coarse accuracy', () => {
    expect(() => assertOfficeGpsAccuracy(undefined)).toThrow(GpsAccuracyError);
    expect(() => assertOfficeGpsAccuracy(500)).toThrow(GpsAccuracyError);
    expect(() => assertOfficeGpsAccuracy(MAX_OFFICE_GPS_ACCURACY_M + 1)).toThrow(GpsAccuracyError);
  });
});
