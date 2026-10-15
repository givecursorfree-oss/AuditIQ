-- Engagement ↔ Google Workspace Shared Drive folder links
CREATE TABLE `EngagementDriveFolder` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `folderId` VARCHAR(191) NOT NULL,
    `driveId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `webViewLink` TEXT NULL,
    `linkedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EngagementDriveFolder_engagementId_folderId_key`(`engagementId`, `folderId`),
    INDEX `EngagementDriveFolder_engagementId_idx`(`engagementId`),
    INDEX `EngagementDriveFolder_driveId_idx`(`driveId`),
    INDEX `EngagementDriveFolder_folderId_idx`(`folderId`),
    INDEX `EngagementDriveFolder_linkedById_idx`(`linkedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EngagementDriveFolder` ADD CONSTRAINT `EngagementDriveFolder_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `EngagementDriveFolder` ADD CONSTRAINT `EngagementDriveFolder_linkedById_fkey` FOREIGN KEY (`linkedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
