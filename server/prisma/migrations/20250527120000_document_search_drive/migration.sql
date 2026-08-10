-- Document indexing, firm visibility, Google Drive sync
-- Safe to apply on DBs that already ran `prisma db push` with these columns (may error on duplicate — baseline with migrate resolve)

ALTER TABLE `Document`
  MODIFY `engagementId` VARCHAR(191) NULL;

ALTER TABLE `Document`
  ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'UPLOAD',
  ADD COLUMN `externalId` VARCHAR(191) NULL,
  ADD COLUMN `visibility` VARCHAR(191) NOT NULL DEFAULT 'ENGAGEMENT',
  ADD COLUMN `firmId` VARCHAR(191) NULL,
  ADD COLUMN `clientId` VARCHAR(191) NULL,
  ADD COLUMN `indexStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `indexedAt` DATETIME(3) NULL,
  ADD COLUMN `driveModifiedAt` DATETIME(3) NULL,
  ADD COLUMN `syncedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `Document_firmId_externalId_key` ON `Document`(`firmId`, `externalId`);
CREATE INDEX `Document_firmId_idx` ON `Document`(`firmId`);
CREATE INDEX `Document_visibility_idx` ON `Document`(`visibility`);
CREATE INDEX `Document_indexStatus_idx` ON `Document`(`indexStatus`);

CREATE TABLE `GoogleDriveConnection` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `firmId` VARCHAR(191) NOT NULL,
  `googleEmail` VARCHAR(191) NULL,
  `encryptedRefreshToken` TEXT NOT NULL,
  `encryptedAccessToken` TEXT NULL,
  `accessTokenExpiresAt` DATETIME(3) NULL,
  `folderIds` TEXT NULL,
  `defaultEngagementId` VARCHAR(191) NULL,
  `lastSyncAt` DATETIME(3) NULL,
  `startPageToken` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GoogleDriveConnection_userId_key`(`userId`),
  INDEX `GoogleDriveConnection_firmId_idx`(`firmId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GoogleDriveConnection`
  ADD CONSTRAINT `GoogleDriveConnection_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
