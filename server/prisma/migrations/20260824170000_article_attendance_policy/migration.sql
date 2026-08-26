-- Article Assistant attendance policy fields (HR Aug 2026) — MySQL
ALTER TABLE `Attendance` ADD COLUMN `lateBand` VARCHAR(191) NULL;
ALTER TABLE `Attendance` ADD COLUMN `clientName` VARCHAR(191) NULL;
ALTER TABLE `Attendance` ADD COLUMN `bioPresent` BOOLEAN NULL;
ALTER TABLE `Attendance` ADD COLUMN `forgiven` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `Attendance` ADD COLUMN `forgivenReason` VARCHAR(191) NULL;
ALTER TABLE `Attendance` ADD COLUMN `forgivenById` VARCHAR(191) NULL;
ALTER TABLE `Attendance` ADD COLUMN `wfhApprovedById` VARCHAR(191) NULL;
ALTER TABLE `Attendance` ADD COLUMN `gpsAccuracy` DOUBLE NULL;

CREATE TABLE `WfhApproval` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `approvedById` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WfhApproval_userId_date_key`(`userId`, `date`),
    INDEX `WfhApproval_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ArticleshipRecord` ADD COLUMN `firmLeaveCredit` DOUBLE NOT NULL DEFAULT 24;
