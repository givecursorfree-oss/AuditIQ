-- Hierarchy title alignment to firm roster + timesheet day attestation
UPDATE `HierarchyLevel` SET `title` = 'HR & Admin Manager', `systemRole` = 'HR' WHERE `code` = 'HR_MANAGER';
UPDATE `HierarchyLevel` SET `systemRole` = 'Accounts' WHERE `code` = 'ACCOUNTS_MANAGER';
UPDATE `HierarchyLevel` SET `title` = 'Office Admin Person' WHERE `code` = 'SENIOR_OFFICE_ADMIN';
UPDATE `HierarchyLevel` SET `title` = 'Office Assistant' WHERE `code` = 'OFFICE_EXECUTIVE';
UPDATE `HierarchyLevel` SET `title` = 'Audit Executive' WHERE `code` = 'AUDIT_EXECUTIVE';

CREATE TABLE `TimesheetDay` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Draft',
    `submittedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TimesheetDay_userId_date_key`(`userId`, `date`),
    INDEX `TimesheetDay_status_idx`(`status`),
    INDEX `TimesheetDay_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TimesheetDay` ADD CONSTRAINT `TimesheetDay_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TimesheetDay` ADD CONSTRAINT `TimesheetDay_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
