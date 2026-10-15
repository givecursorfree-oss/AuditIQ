-- GST notices register (Excel import + hosted edits)
ALTER TABLE `Client`
  ADD COLUMN `gstNoticeLastImportAt` DATETIME(3) NULL,
  ADD COLUMN `gstNoticeDataComplete` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `Client_gstin_idx` ON `Client`(`gstin`);

CREATE TABLE `ClientGstNotice` (
  `id` VARCHAR(191) NOT NULL,
  `firmId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `noticeOrderId` VARCHAR(191) NOT NULL,
  `importOrder` INTEGER NOT NULL DEFAULT 0,
  `portalType` VARCHAR(191) NULL,
  `portalDescription` TEXT NULL,
  `portalIssueDate` DATE NULL,
  `portalDueDate` DATE NULL,
  `portalDueKind` VARCHAR(191) NOT NULL DEFAULT 'unclear',
  `portalPeriod` VARCHAR(191) NULL,
  `portalSourceStatus` VARCHAR(191) NULL,
  `portalAssignedTo` VARCHAR(191) NULL,
  `overrideType` VARCHAR(191) NULL,
  `overrideDescription` TEXT NULL,
  `overrideIssueDate` DATE NULL,
  `overrideDueDate` DATE NULL,
  `overrideDueKind` VARCHAR(191) NULL,
  `overridePeriod` VARCHAR(191) NULL,
  `appStatus` VARCHAR(191) NOT NULL DEFAULT 'Auto',
  `customStatus` VARCHAR(191) NULL,
  `followUp` VARCHAR(191) NOT NULL DEFAULT 'None',
  `customFollowUp` VARCHAR(191) NULL,
  `followUpDueDate` DATE NULL,
  `assignedTo` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `viewState` VARCHAR(191) NOT NULL DEFAULT 'New',
  `seenAt` DATETIME(3) NULL,
  `editedBy` VARCHAR(191) NULL,
  `editedAt` DATETIME(3) NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `lastImportedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `ClientGstNotice_clientId_noticeOrderId_key` ON `ClientGstNotice`(`clientId`, `noticeOrderId`);
CREATE INDEX `ClientGstNotice_firmId_clientId_idx` ON `ClientGstNotice`(`firmId`, `clientId`);
CREATE INDEX `ClientGstNotice_viewState_idx` ON `ClientGstNotice`(`viewState`);
CREATE INDEX `ClientGstNotice_importOrder_idx` ON `ClientGstNotice`(`importOrder`);

ALTER TABLE `ClientGstNotice`
  ADD CONSTRAINT `ClientGstNotice_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
