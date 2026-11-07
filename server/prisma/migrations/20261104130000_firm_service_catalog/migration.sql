-- Firm-scoped service catalog (add / edit / archive lifecycle)
CREATE TABLE `FirmService` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `dueRule` VARCHAR(191) NULL,
    `recurrence` VARCHAR(191) NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `archivedAt` DATETIME(3) NULL,
    `archivedById` VARCHAR(191) NULL,
    `restoredAt` DATETIME(3) NULL,
    `restoredById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `FirmService_firmId_code_key` ON `FirmService`(`firmId`, `code`);
CREATE INDEX `FirmService_firmId_archivedAt_idx` ON `FirmService`(`firmId`, `archivedAt`);
CREATE INDEX `FirmService_firmId_domain_idx` ON `FirmService`(`firmId`, `domain`);
CREATE INDEX `FirmService_archivedById_idx` ON `FirmService`(`archivedById`);
CREATE INDEX `FirmService_restoredById_idx` ON `FirmService`(`restoredById`);

ALTER TABLE `FirmService` ADD CONSTRAINT `FirmService_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FirmService` ADD CONSTRAINT `FirmService_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `FirmService` ADD CONSTRAINT `FirmService_archivedById_fkey` FOREIGN KEY (`archivedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `FirmService` ADD CONSTRAINT `FirmService_restoredById_fkey` FOREIGN KEY (`restoredById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
