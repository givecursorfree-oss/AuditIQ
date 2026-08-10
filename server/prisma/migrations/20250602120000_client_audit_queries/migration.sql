-- Client audit queries (portal Q&A per engagement)
-- Safe to skip if table already exists from `prisma db push` (mark applied with migrate resolve)

CREATE TABLE `ClientAuditQuery` (
  `id` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'Open',
  `response` TEXT NULL,
  `respondedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `engagementId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `respondedById` VARCHAR(191) NULL,

  INDEX `ClientAuditQuery_engagementId_idx`(`engagementId`),
  INDEX `ClientAuditQuery_clientId_idx`(`clientId`),
  INDEX `ClientAuditQuery_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ClientAuditQuery`
  ADD CONSTRAINT `ClientAuditQuery_engagementId_fkey`
  FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ClientAuditQuery`
  ADD CONSTRAINT `ClientAuditQuery_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ClientAuditQuery`
  ADD CONSTRAINT `ClientAuditQuery_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ClientAuditQuery`
  ADD CONSTRAINT `ClientAuditQuery_respondedById_fkey`
  FOREIGN KEY (`respondedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
