-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `authMethod` VARCHAR(191) NOT NULL DEFAULT 'phone',
    ADD COLUMN `avatar` VARCHAR(191) NULL,
    ADD COLUMN `birthDate` DATE NULL,
    ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `gender` VARCHAR(191) NULL,
    ADD COLUMN `marketingConsentAt` DATETIME(3) NULL,
    ADD COLUMN `marketingPush` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `marketingSms` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `EmailCode` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `customerId` INTEGER NULL,

    INDEX `EmailCode_email_createdAt_idx`(`email`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VisitSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NULL,
    `visitorKey` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `durationSec` INTEGER NOT NULL DEFAULT 0,
    `referrer` VARCHAR(500) NULL,
    `ua` VARCHAR(300) NULL,

    INDEX `VisitSession_customerId_startedAt_idx`(`customerId`, `startedAt`),
    INDEX `VisitSession_visitorKey_startedAt_idx`(`visitorKey`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VisitEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `customerId` INTEGER NULL,
    `type` VARCHAR(191) NOT NULL,
    `path` VARCHAR(500) NULL,
    `productId` INTEGER NULL,
    `query` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VisitEvent_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `VisitEvent_productId_createdAt_idx`(`productId`, `createdAt`),
    INDEX `VisitEvent_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BulkMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `channel` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `filter` TEXT NULL,
    `total` INTEGER NOT NULL DEFAULT 0,
    `sent` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'running',
    `error` TEXT NULL,
    `byUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `BulkMessage_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BulkRecipient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bulkId` INTEGER NOT NULL,
    `customerId` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `error` VARCHAR(300) NULL,
    `sentAt` DATETIME(3) NULL,

    INDEX `BulkRecipient_bulkId_status_idx`(`bulkId`, `status`),
    UNIQUE INDEX `BulkRecipient_bulkId_customerId_key`(`bulkId`, `customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerPhoneChange` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `oldPhone` VARCHAR(191) NOT NULL,
    `newPhone` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(500) NULL,
    `byUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomerPhoneChange_customerId_createdAt_idx`(`customerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Customer_email_idx` ON `Customer`(`email`);

-- CreateIndex
CREATE INDEX `Customer_birthDate_idx` ON `Customer`(`birthDate`);

-- AddForeignKey
ALTER TABLE `EmailCode` ADD CONSTRAINT `EmailCode_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VisitSession` ADD CONSTRAINT `VisitSession_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VisitEvent` ADD CONSTRAINT `VisitEvent_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `VisitSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BulkRecipient` ADD CONSTRAINT `BulkRecipient_bulkId_fkey` FOREIGN KEY (`bulkId`) REFERENCES `BulkMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerPhoneChange` ADD CONSTRAINT `CustomerPhoneChange_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

