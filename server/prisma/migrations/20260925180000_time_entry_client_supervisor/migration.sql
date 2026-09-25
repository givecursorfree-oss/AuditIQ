-- Manual timesheet lines can name a client without an engagement, plus the supervising partner/manager.
ALTER TABLE `TimeEntry` MODIFY `engagementId` VARCHAR(191) NULL;
ALTER TABLE `TimeEntry` ADD COLUMN `clientName` VARCHAR(191) NULL;
ALTER TABLE `TimeEntry` ADD COLUMN `compOff` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `TimeEntry` ADD COLUMN `supervisorId` VARCHAR(191) NULL;
CREATE INDEX `TimeEntry_supervisorId_idx` ON `TimeEntry`(`supervisorId`);
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
