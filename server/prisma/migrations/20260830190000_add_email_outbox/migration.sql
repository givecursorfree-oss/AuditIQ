CREATE TABLE `EmailOutbox` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `engagementId` VARCHAR(191) NULL,
    `toAddress` VARCHAR(191) NOT NULL,
    `ccAddress` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NOT NULL,
    `body` LONGTEXT NOT NULL,
    `templateKey` VARCHAR(191) NOT NULL DEFAULT 'other',
    `metadata` LONGTEXT NULL,
    `attachments` LONGTEXT NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 5,
    `retryAt` DATETIME(3) NULL,
    `lastAttemptAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `failedAt` DATETIME(3) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmailOutbox_status_scheduledAt_idx`(`status`, `scheduledAt`),
    INDEX `EmailOutbox_status_retryAt_idx`(`status`, `retryAt`),
    INDEX `EmailOutbox_clientId_idx`(`clientId`),
    INDEX `EmailOutbox_engagementId_idx`(`engagementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmailOutbox`
  ADD CONSTRAINT `EmailOutbox_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `EmailOutbox_engagementId_fkey`
  FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `TemplateSend`
  ADD COLUMN `scheduledAt` DATETIME(3) NULL;
