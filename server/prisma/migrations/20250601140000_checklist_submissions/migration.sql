-- Link client checklist uploads to documents; support revision workflow
ALTER TABLE "DataChecklistItem" ADD COLUMN "documentId" TEXT;
ALTER TABLE "DataChecklistItem" ADD COLUMN "revisionNotes" TEXT;
ALTER TABLE "DataChecklistItem" ADD COLUMN "revisionRequestedAt" TIMESTAMP(3);

CREATE INDEX "DataChecklistItem_documentId_idx" ON "DataChecklistItem"("documentId");

ALTER TABLE "DataChecklistItem" ADD CONSTRAINT "DataChecklistItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
