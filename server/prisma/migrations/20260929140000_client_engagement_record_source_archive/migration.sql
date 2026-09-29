-- Client & Engagement provenance + client archive (Imports spec)
ALTER TABLE `Client`
  ADD COLUMN `recordSource` VARCHAR(191) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `createdById` VARCHAR(191) NULL,
  ADD COLUMN `importedById` VARCHAR(191) NULL,
  ADD COLUMN `importedAt` DATETIME(3) NULL,
  ADD COLUMN `archivedAt` DATETIME(3) NULL,
  ADD COLUMN `archivedById` VARCHAR(191) NULL,
  ADD COLUMN `restoredAt` DATETIME(3) NULL,
  ADD COLUMN `restoredById` VARCHAR(191) NULL;

CREATE INDEX `Client_recordSource_idx` ON `Client`(`recordSource`);
CREATE INDEX `Client_archivedAt_idx` ON `Client`(`archivedAt`);
CREATE INDEX `Client_createdById_idx` ON `Client`(`createdById`);
CREATE INDEX `Client_importedById_idx` ON `Client`(`importedById`);
CREATE INDEX `Client_archivedById_idx` ON `Client`(`archivedById`);
CREATE INDEX `Client_restoredById_idx` ON `Client`(`restoredById`);

ALTER TABLE `Client`
  ADD CONSTRAINT `Client_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Client_importedById_fkey` FOREIGN KEY (`importedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Client_archivedById_fkey` FOREIGN KEY (`archivedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Client_restoredById_fkey` FOREIGN KEY (`restoredById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Engagement`
  ADD COLUMN `recordSource` VARCHAR(191) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `createdById` VARCHAR(191) NULL,
  ADD COLUMN `importedById` VARCHAR(191) NULL,
  ADD COLUMN `importedAt` DATETIME(3) NULL,
  ADD COLUMN `archivedById` VARCHAR(191) NULL,
  ADD COLUMN `restoredAt` DATETIME(3) NULL,
  ADD COLUMN `restoredById` VARCHAR(191) NULL;

CREATE INDEX `Engagement_recordSource_idx` ON `Engagement`(`recordSource`);
CREATE INDEX `Engagement_createdById_idx` ON `Engagement`(`createdById`);
CREATE INDEX `Engagement_importedById_idx` ON `Engagement`(`importedById`);
CREATE INDEX `Engagement_archivedById_idx` ON `Engagement`(`archivedById`);
CREATE INDEX `Engagement_restoredById_idx` ON `Engagement`(`restoredById`);

ALTER TABLE `Engagement`
  ADD CONSTRAINT `Engagement_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Engagement_importedById_fkey` FOREIGN KEY (`importedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Engagement_archivedById_fkey` FOREIGN KEY (`archivedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Engagement_restoredById_fkey` FOREIGN KEY (`restoredById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
