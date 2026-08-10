/**
 * ponytail: tiny self-check for resolveApiBaseUrl / SPA HTML detection.
 * Run: npx --yes tsx client/src/lib/apiBase.selfcheck.ts
 */
import { looksLikeSpaHtml } from './apiBase.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(looksLikeSpaHtml('<!DOCTYPE html><html>') === true, 'detects doctype html');
assert(looksLikeSpaHtml({ ok: true }) === false, 'objects are not html');
assert(looksLikeSpaHtml('{"ok":true}') === false, 'json string is not html');

console.log('apiBase.selfcheck: ok');
