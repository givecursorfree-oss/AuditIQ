-- Firm HR setting: max minutes between app login/out and biometric punch
ALTER TABLE `Firm` ADD COLUMN `bioDeviationMinutes` INTEGER NOT NULL DEFAULT 30;

-- Daily biometric punches from device export
CREATE TABLE `BiometricDay` (
    `id` VARCHAR(191) NOT NULL,
    `firmId` VARCHAR(191) NOT NULL,
    `employeeCode` VARCHAR(191) NOT NULL,
    `bioName` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `date` DATETIME(3) NOT NULL,
    `inTime` VARCHAR(191) NULL,
    `outTime` VARCHAR(191) NULL,
    `workHrs` VARCHAR(191) NULL,
    `checkInDeviationMinutes` INTEGER NULL,
    `checkOutDeviationMinutes` INTEGER NULL,
    `deviationFlag` BOOLEAN NOT NULL DEFAULT false,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BiometricDay_firmId_employeeCode_date_key`(`firmId`, `employeeCode`, `date`),
    INDEX `BiometricDay_firmId_userId_date_idx`(`firmId`, `userId`, `date`),
    INDEX `BiometricDay_firmId_date_idx`(`firmId`, `date`),
    INDEX `BiometricDay_userId_date_idx`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BiometricDay` ADD CONSTRAINT `BiometricDay_firmId_fkey` FOREIGN KEY (`firmId`) REFERENCES `Firm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BiometricDay` ADD CONSTRAINT `BiometricDay_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `EmployeeProfile_employeeCode_idx` ON `EmployeeProfile`(`employeeCode`);
