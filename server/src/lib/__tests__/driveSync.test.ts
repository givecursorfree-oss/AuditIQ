import { describe, it, expect } from 'vitest';
import {
  parseGoogleDriveFolderId,
  parseSyncFolders,
  serializeSyncFolders,
} from '../driveSync.js';

describe('parseGoogleDriveFolderId', () => {
  it('accepts raw ids', () => {
    expect(parseGoogleDriveFolderId('1aBcDeFgHiJkLmNoPqRsTuVwXyZ')).toBe(
      '1aBcDeFgHiJkLmNoPqRsTuVwXyZ'
    );
  });

  it('parses folder URLs', () => {
    expect(
      parseGoogleDriveFolderId(
        'https://drive.google.com/drive/folders/0ABcdSharedDriveXYZ?usp=sharing'
      )
    ).toBe('0ABcdSharedDriveXYZ');
  });

  it('parses open?id= URLs', () => {
    expect(
      parseGoogleDriveFolderId('https://drive.google.com/open?id=1folderIdHere99')
    ).toBe('1folderIdHere99');
  });

  it('rejects garbage', () => {
    expect(parseGoogleDriveFolderId('')).toBeNull();
    expect(parseGoogleDriveFolderId('not a link')).toBeNull();
  });
});

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
