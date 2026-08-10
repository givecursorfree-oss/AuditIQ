-- MKD workflow domain, service catalog fields, hierarchy, monthly periods

ALTER TABLE `Engagement` ADD COLUMN `workflowDomain` VARCHAR(191) NULL;
ALTER TABLE `Engagement` ADD COLUMN `serviceCode` VARCHAR(191) NULL;
CREATE INDEX `Engagement_workflowDomain_idx` ON `Engagement`(`workflowDomain`);
CREATE INDEX `Engagement_serviceCode_idx` ON `Engagement`(`serviceCode`);

ALTER TABLE `User` ADD COLUMN `hierarchyLevelId` VARCHAR(191) NULL;

CREATE TABLE `HierarchyLevel` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `systemRole` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `HierarchyLevel_code_key`(`code`),
    INDEX `HierarchyLevel_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EngagementPeriod` (
    `id` VARCHAR(191) NOT NULL,
    `periodKey` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `dueDate` DATETIME(3) NULL,
    `currentStage` VARCHAR(191) NOT NULL DEFAULT 'Data Request',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    UNIQUE INDEX `EngagementPeriod_engagementId_periodKey_key`(`engagementId`, `periodKey`),
    INDEX `EngagementPeriod_engagementId_idx`(`engagementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `User` ADD CONSTRAINT `User_hierarchyLevelId_fkey` FOREIGN KEY (`hierarchyLevelId`) REFERENCES `HierarchyLevel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `EngagementPeriod` ADD CONSTRAINT `EngagementPeriod_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
