/** Client-submitted files for an engagement (portal upload or checklist). */
export function isClientSubmittedDocument(doc: {
  folder: string;
  uploadedBy: { role: string };
}): boolean {
  return doc.folder === 'Client Upload' || doc.uploadedBy.role === 'Client';
}
