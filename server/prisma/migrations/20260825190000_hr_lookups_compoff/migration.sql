-- Firm lookup masters (attendance clients, activity classification, holidays)
CREATE TABLE `FirmLookupValue` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FirmLookupValue_firmId_kind_value_key`(`firmId`, `kind`, `value`),
    INDEX `FirmLookupValue_firmId_kind_idx`(`firmId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Comp-off requests (Article Sunday/holiday → Manager → HR leave credit)
CREATE TABLE `CompOffRequest` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `workDate` DATETIME(3) NOT NULL,
    `days` DOUBLE NOT NULL DEFAULT 1,
    `reason` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `managerApprovedById` VARCHAR(191) NULL,
    `managerApprovedAt` DATETIME(3) NULL,
    `hrCreditedById` VARCHAR(191) NULL,
    `hrCreditedAt` DATETIME(3) NULL,
    `rejectedById` VARCHAR(191) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `rejectionReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CompOffRequest_firmId_status_idx`(`firmId`, `status`),
    INDEX `CompOffRequest_userId_idx`(`userId`),
    INDEX `CompOffRequest_workDate_idx`(`workDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FirmLookupValue` ADD CONSTRAINT `FirmLookupValue_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CompOffRequest` ADD CONSTRAINT `CompOffRequest_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CompOffRequest` ADD CONSTRAINT `CompOffRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CompOffRequest` ADD CONSTRAINT `CompOffRequest_managerApprovedById_fkey` FOREIGN KEY (`managerApprovedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CompOffRequest` ADD CONSTRAINT `CompOffRequest_hrCreditedById_fkey` FOREIGN KEY (`hrCreditedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
