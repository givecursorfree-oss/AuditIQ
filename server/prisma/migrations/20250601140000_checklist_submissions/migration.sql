-- Link client checklist uploads to documents; support revision workflow (MySQL)
ALTER TABLE `DataChecklistItem` ADD COLUMN `documentId` VARCHAR(191) NULL;
ALTER TABLE `DataChecklistItem` ADD COLUMN `revisionNotes` TEXT NULL;
ALTER TABLE `DataChecklistItem` ADD COLUMN `revisionRequestedAt` DATETIME(3) NULL;

CREATE INDEX `DataChecklistItem_documentId_idx` ON `DataChecklistItem`(`documentId`);

ALTER TABLE `DataChecklistItem`
  ADD CONSTRAINT `DataChecklistItem_documentId_fkey`
  FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
