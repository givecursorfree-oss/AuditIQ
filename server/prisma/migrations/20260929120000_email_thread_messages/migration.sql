-- Email thread messages for outbound data-request logs + inbound reply mapping
CREATE TABLE IF NOT EXISTS `EmailThreadMessage` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `inReplyTo` VARCHAR(191) NULL,
    `referencesHdr` TEXT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `threadRootId` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NOT NULL,
    `fromAddress` VARCHAR(191) NOT NULL,
    `toAddress` VARCHAR(191) NOT NULL,
    `ccAddress` VARCHAR(191) NULL,
    `bodyText` LONGTEXT NULL,
    `bodyHtml` LONGTEXT NULL,
    `clientId` VARCHAR(191) NULL,
    `engagementId` VARCHAR(191) NULL,
    `commsLogId` VARCHAR(191) NULL,
    `teamUserIds` TEXT NULL,
    `imapUid` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailThreadMessage_messageId_key`(`messageId`),
    INDEX `EmailThreadMessage_threadRootId_idx`(`threadRootId`),
    INDEX `EmailThreadMessage_engagementId_idx`(`engagementId`),
    INDEX `EmailThreadMessage_clientId_idx`(`clientId`),
    INDEX `EmailThreadMessage_direction_idx`(`direction`),
    INDEX `EmailThreadMessage_imapUid_idx`(`imapUid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @fk_client := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'EmailThreadMessage'
    AND CONSTRAINT_NAME = 'EmailThreadMessage_clientId_fkey'
);
SET @sql_client := IF(
  @fk_client = 0,
  'ALTER TABLE `EmailThreadMessage` ADD CONSTRAINT `EmailThreadMessage_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_client FROM @sql_client;
EXECUTE stmt_client;
DEALLOCATE PREPARE stmt_client;

SET @fk_eng := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'EmailThreadMessage'
    AND CONSTRAINT_NAME = 'EmailThreadMessage_engagementId_fkey'
);
SET @sql_eng := IF(
  @fk_eng = 0,
  'ALTER TABLE `EmailThreadMessage` ADD CONSTRAINT `EmailThreadMessage_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_eng FROM @sql_eng;
EXECUTE stmt_eng;
DEALLOCATE PREPARE stmt_eng;
