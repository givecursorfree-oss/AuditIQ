-- Half-day leave stores 0.5 days; ICAI counters must accept a half day.
ALTER TABLE `LeaveRequest` MODIFY `days` DOUBLE NOT NULL;
ALTER TABLE `LeaveRequest` ADD COLUMN `halfDay` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `ArticleshipRecord` MODIFY `examLeaveUsed` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `ArticleshipRecord` MODIFY `casualLeaveUsed` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `ArticleshipRecord` MODIFY `sickLeaveUsed` DOUBLE NOT NULL DEFAULT 0;

-- Manager/Partner selected on the manual time grid for a comp-off.
ALTER TABLE `CompOffRequest` ADD COLUMN `assignedManagerId` VARCHAR(191) NULL;
CREATE INDEX `CompOffRequest_assignedManagerId_idx` ON `CompOffRequest`(`assignedManagerId`);
ALTER TABLE `CompOffRequest` ADD CONSTRAINT `CompOffRequest_assignedManagerId_fkey` FOREIGN KEY (`assignedManagerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
