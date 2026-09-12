-- Travel Claims v0.2 fields on ExpenseClaim + ClaimBatch rejected status

ALTER TABLE `ExpenseClaim`
  ADD COLUMN `travelTime` VARCHAR(191) NULL,
  ADD COLUMN `jurisdiction` VARCHAR(191) NULL,
  ADD COLUMN `centreState` VARCHAR(191) NULL,
  ADD COLUMN `location` VARCHAR(191) NULL,
  ADD COLUMN `mapLink` VARCHAR(191) NULL,
  ADD COLUMN `visitedById` VARCHAR(191) NULL,
  ADD COLUMN `period` VARCHAR(191) NULL,
  ADD COLUMN `issue` TEXT NULL,
  ADD COLUMN `replyFromDepartment` TEXT NULL,
  ADD COLUMN `travelMode` VARCHAR(191) NULL;

ALTER TABLE `ExpenseClaim`
  ADD INDEX `ExpenseClaim_visitedById_idx` (`visitedById`),
  ADD CONSTRAINT `ExpenseClaim_visitedById_fkey`
    FOREIGN KEY (`visitedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
