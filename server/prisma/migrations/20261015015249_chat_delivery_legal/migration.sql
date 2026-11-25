-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `consentAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `agreedAt` DATETIME(3) NULL,
    ADD COLUMN `deliveryInfo` TEXT NULL,
    ADD COLUMN `deliveryName` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `weight` DOUBLE NULL;

-- CreateTable
CREATE TABLE `Conversation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `visitorKey` VARCHAR(191) NOT NULL,
    `customerId` INTEGER NULL,
    `name` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `unreadAdmin` INTEGER NOT NULL DEFAULT 0,
    `unreadCustomer` INTEGER NOT NULL DEFAULT 0,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastText` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Conversation_visitorKey_key`(`visitorKey`),
    INDEX `Conversation_lastMessageAt_idx`(`lastMessageAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` INTEGER NOT NULL,
    `sender` VARCHAR(191) NOT NULL,
    `userId` INTEGER NULL,
    `text` TEXT NULL,
    `image` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatMessage_conversationId_id_idx`(`conversationId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushSubscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `endpoint` VARCHAR(700) NOT NULL,
    `keys` TEXT NOT NULL,
    `userId` INTEGER NULL,
    `visitorKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PushSubscription_endpoint_key`(`endpoint`(500)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
