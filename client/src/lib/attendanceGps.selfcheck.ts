/**
 * Runnable check: client/server GPS accuracy caps stay aligned.
 * Run: npx tsx --tsconfig ../server/tsconfig.json -e "..." 
 * Or from client via vitest-free assert when imported in node.
 */
import assert from 'node:assert/strict';
import { MAX_OFFICE_GPS_ACCURACY_M as clientMax } from './attendanceGps.ts';

// Mirror of server constant — fail if someone drifts the client copy
const SERVER_MAX = 100;
assert.equal(clientMax, SERVER_MAX, 'client MAX_OFFICE_GPS_ACCURACY_M must match server (100)');
console.log('attendanceGps.selfcheck: ok');
