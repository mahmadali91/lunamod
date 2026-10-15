-- CreateTable
CREATE TABLE `ChannelExpense` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `channelId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChannelExpense` ADD CONSTRAINT `ChannelExpense_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `SalesChannel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
