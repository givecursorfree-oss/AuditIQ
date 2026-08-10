-- Staff work status, attendance activity tracking, stopwatch pause, time entry stage

ALTER TABLE `Attendance` ADD COLUMN `totalActiveSeconds` INT NOT NULL DEFAULT 0;
ALTER TABLE `Attendance` ADD COLUMN `totalAwaySeconds` INT NOT NULL DEFAULT 0;

ALTER TABLE `TimeEntry` ADD COLUMN `stage` VARCHAR(191) NULL;

ALTER TABLE `ClientStopwatch` ADD COLUMN `stage` VARCHAR(191) NULL;
ALTER TABLE `ClientStopwatch` ADD COLUMN `isPaused` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `ClientStopwatch` ADD COLUMN `pausedAt` DATETIME(3) NULL;

CREATE TABLE `StaffWorkStatus` (
    `userId` VARCHAR(191) NOT NULL,
    `activityStatus` VARCHAR(191) NOT NULL DEFAULT 'offline',
    `currentEngagementId` VARCHAR(191) NULL,
    `currentStage` VARCHAR(191) NULL,
    `timerStartedAt` DATETIME(3) NULL,
    `lastActiveAt` DATETIME(3) NULL,
    `awaySince` DATETIME(3) NULL,
    `statusChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StaffWorkStatus_activityStatus_idx`(`activityStatus`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StaffWorkStatus` ADD CONSTRAINT `StaffWorkStatus_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
