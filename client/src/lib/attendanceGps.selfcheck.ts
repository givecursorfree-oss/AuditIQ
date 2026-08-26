/**
 * Runnable check: client/server GPS accuracy caps stay aligned.
 */
import assert from 'node:assert/strict';
import { MAX_OFFICE_GPS_ACCURACY_M as clientMax } from './attendanceGps.ts';

const SERVER_MAX = 2500;
assert.equal(clientMax, SERVER_MAX, 'client MAX_OFFICE_GPS_ACCURACY_M must match server (2500)');
console.log('attendanceGps.selfcheck: ok');
