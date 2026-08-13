/**
 * ponytail: runnable check for formatApiError.
 * Run: npx --yes tsx client/src/lib/apiErrors.selfcheck.ts
 */
import { formatApiError, isApiNetworkFailure } from './apiErrors.ts';
import assert from 'node:assert/strict';

const timeoutErr = { isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 25000ms exceeded' };
assert.match(formatApiError(timeoutErr, 'dashboard'), /too long/i);
assert.equal(isApiNetworkFailure(timeoutErr), true);

const netErr = { isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error' };
assert.match(formatApiError(netErr, 'login'), /Cannot (reach|connect)/i);

console.log('apiErrors.selfcheck: ok');
