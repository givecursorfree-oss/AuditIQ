-- Phase 2: group claims, OCR, multi-manager approval

ALTER TABLE `ExpenseClaim`
  MODIFY `engagementId` VARCHAR(191) NULL,
  MODIFY `clientId` VARCHAR(191) NULL,
  MODIFY `workType` VARCHAR(191) NULL,
  ADD COLUMN `ocrDetectedAmount` DECIMAL(12, 2) NULL,
  ADD COLUMN `ocrStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  ADD COLUMN `expensePayerId` VARCHAR(191) NULL,
  ADD COLUMN `participantCount` INT NOT NULL DEFAULT 1;

ALTER TABLE `ExpenseClaim`
  ADD INDEX `ExpenseClaim_expensePayerId_idx` (`expensePayerId`),
  ADD CONSTRAINT `ExpenseClaim_expensePayerId_fkey`
    FOREIGN KEY (`expensePayerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `ExpenseClaimParticipant` (
  `id` VARCHAR(191) NOT NULL,
  `claimId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `engagementId` VARCHAR(191) NULL,
  `clientId` VARCHAR(191) NULL,
  `workType` VARCHAR(191) NULL,
  `workTypeOther` VARCHAR(191) NULL,
  `amountShare` DECIMAL(12, 2) NOT NULL,
  `managerId` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  INDEX `ExpenseClaimParticipant_claimId_idx` (`claimId`),
  INDEX `ExpenseClaimParticipant_userId_idx` (`userId`),
  INDEX `ExpenseClaimParticipant_managerId_idx` (`managerId`),
  CONSTRAINT `ExpenseClaimParticipant_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `ExpenseClaim`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ExpenseClaimParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ExpenseClaimParticipant_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ExpenseClaimParticipant_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ExpenseClaimManagerApproval` (
  `id` VARCHAR(191) NOT NULL,
  `claimId` VARCHAR(191) NOT NULL,
  `managerId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `teamAmount` DECIMAL(12, 2) NOT NULL,
  `approvedAmount` DECIMAL(12, 2) NULL,
  `rejectReasonInternal` TEXT NULL,
  `partialApproveReason` TEXT NULL,
  `reviewedById` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ExpenseClaimManagerApproval_claimId_managerId_key` (`claimId`, `managerId`),
  INDEX `ExpenseClaimManagerApproval_claimId_idx` (`claimId`),
  INDEX `ExpenseClaimManagerApproval_managerId_idx` (`managerId`),
  INDEX `ExpenseClaimManagerApproval_status_idx` (`status`),
  CONSTRAINT `ExpenseClaimManagerApproval_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `ExpenseClaim`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ExpenseClaimManagerApproval_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ExpenseClaimManagerApproval_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill single-participant rows for existing claims
INSERT INTO `ExpenseClaimParticipant` (`id`, `claimId`, `userId`, `engagementId`, `clientId`, `workType`, `workTypeOther`, `amountShare`, `managerId`)
SELECT
  UUID(),
  c.`id`,
  c.`staffId`,
  c.`engagementId`,
  c.`clientId`,
  c.`workType`,
  c.`workTypeOther`,
  c.`amount`,
  u.`reportsToId`
FROM `ExpenseClaim` c
JOIN `User` u ON u.`id` = c.`staffId`
WHERE NOT EXISTS (SELECT 1 FROM `ExpenseClaimParticipant` p WHERE p.`claimId` = c.`id`);

INSERT INTO `ExpenseClaimManagerApproval` (`id`, `claimId`, `managerId`, `status`, `teamAmount`, `approvedAmount`, `reviewedById`, `reviewedAt`)
SELECT
  UUID(),
  c.`id`,
  COALESCE(u.`reportsToId`, c.`managerReviewedById`),
  CASE
    WHEN c.`claimStatus` = 'approved' THEN 'approved'
    WHEN c.`claimStatus` = 'partially_approved' THEN 'partially_approved'
    WHEN c.`claimStatus` = 'rejected' THEN 'rejected'
    ELSE 'pending'
  END,
  c.`amount`,
  c.`approvedAmount`,
  c.`managerReviewedById`,
  c.`managerReviewedAt`
FROM `ExpenseClaim` c
JOIN `User` u ON u.`id` = c.`staffId`
WHERE COALESCE(u.`reportsToId`, c.`managerReviewedById`) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `ExpenseClaimManagerApproval` a WHERE a.`claimId` = c.`id`);

UPDATE `ExpenseClaim` SET `expensePayerId` = `staffId` WHERE `expensePayerId` IS NULL;
