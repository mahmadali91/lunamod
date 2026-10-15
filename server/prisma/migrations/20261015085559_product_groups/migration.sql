-- AlterTable
ALTER TABLE `Product` ADD COLUMN `groupId` INTEGER NULL;

-- CreateTable
CREATE TABLE `ProductGroup` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Product_groupId_idx` ON `Product`(`groupId`);

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ProductGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
