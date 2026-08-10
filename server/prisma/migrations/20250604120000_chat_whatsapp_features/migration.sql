-- AlterTable
ALTER TABLE `ChatParticipant` ADD COLUMN `isPinned` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `ChatParticipant` ADD COLUMN `isArchived` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `ChatMessageReaction` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ChatMessageReaction_messageId_userId_key`(`messageId`, `userId`),
    INDEX `ChatMessageReaction_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessageStar` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `starredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ChatMessageStar_messageId_userId_key`(`messageId`, `userId`),
    INDEX `ChatMessageStar_userId_idx`(`userId`),
    INDEX `ChatMessageStar_roomId_idx`(`roomId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatMessageReaction` ADD CONSTRAINT `ChatMessageReaction_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `ChatMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ChatMessageReaction` ADD CONSTRAINT `ChatMessageReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessageStar` ADD CONSTRAINT `ChatMessageStar_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `ChatMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ChatMessageStar` ADD CONSTRAINT `ChatMessageStar_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
