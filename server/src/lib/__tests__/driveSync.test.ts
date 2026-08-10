import { describe, it, expect } from 'vitest';
import { parseSyncFolders, serializeSyncFolders } from '../driveSync.js';

describe('parseSyncFolders', () => {
  it('parses legacy string array', () => {
    expect(parseSyncFolders(JSON.stringify(['abc', 'def']))).toEqual([
      { id: 'abc', name: 'abc' },
      { id: 'def', name: 'def' },
    ]);
  });

  it('parses folder objects with names', () => {
    const raw = JSON.stringify([
      { id: 'f1', name: 'Audit Files' },
      { id: 'f2', name: 'Tax Returns' },
    ]);
    expect(parseSyncFolders(raw)).toEqual([
      { id: 'f1', name: 'Audit Files' },
      { id: 'f2', name: 'Tax Returns' },
    ]);
  });

  it('returns empty for invalid JSON', () => {
    expect(parseSyncFolders('not-json')).toEqual([]);
    expect(parseSyncFolders(null)).toEqual([]);
  });

  it('round-trips through serialize', () => {
    const folders = [{ id: 'x', name: 'Client Docs' }];
    expect(parseSyncFolders(serializeSyncFolders(folders))).toEqual(folders);
  });
});
