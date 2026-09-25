-- Per-person notes on group claims, and a real link from each person to their approver.

ALTER TABLE `ExpenseClaimParticipant` ADD COLUMN `notes` TEXT NULL;

ALTER TABLE `ExpenseClaimParticipant`
  ADD CONSTRAINT `ExpenseClaimParticipant_managerId_fkey`
  FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
