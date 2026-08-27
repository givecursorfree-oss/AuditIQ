/**
 * Run: npx tsx src/lib/geofence.selfcheck.ts
 */
import {
  assertOfficeGpsAccuracy,
  GpsAccuracyError,
  MAX_OFFICE_GPS_ACCURACY_M,
  metersBetween,
  MKD_OFFICE_LAT,
  MKD_OFFICE_LNG,
} from './geofence.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(metersBetween(MKD_OFFICE_LAT, MKD_OFFICE_LNG, MKD_OFFICE_LAT, MKD_OFFICE_LNG) < 1, 'same point');
assertOfficeGpsAccuracy(25);
assertOfficeGpsAccuracy(MAX_OFFICE_GPS_ACCURACY_M);
let threw = false;
try {
  assertOfficeGpsAccuracy(MAX_OFFICE_GPS_ACCURACY_M + 100);
} catch (e) {
  threw = e instanceof GpsAccuracyError;
}
assert(threw, 'coarse accuracy beyond max must throw GpsAccuracyError');
console.log('geofence.selfcheck: ok');
