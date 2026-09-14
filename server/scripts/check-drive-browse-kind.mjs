/** ponytail: self-check — Drive browse kind from mimeType */
const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';

function kindOf(mimeType) {
  return mimeType === GOOGLE_FOLDER_MIME ? 'folder' : 'file';
}

const cases = [
  [GOOGLE_FOLDER_MIME, 'folder'],
  ['application/pdf', 'file'],
  ['application/vnd.google-apps.document', 'file'],
];

for (const [mime, expected] of cases) {
  const got = kindOf(mime);
  if (got !== expected) {
    console.error(`FAIL: ${mime} → ${got} (want ${expected})`);
    process.exit(1);
  }
}
console.log('ok: drive browse kind');
