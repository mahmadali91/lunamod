-- AlterTable
ALTER TABLE `Category` ADD COLUMN `sizeChartId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `cart` TEXT NULL,
    ADD COLUMN `cartReminded` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `cartUpdatedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `brand` VARCHAR(191) NULL,
    ADD COLUMN `color` VARCHAR(191) NULL,
    ADD COLUMN `hasVariants` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `modelInfo` VARCHAR(191) NULL,
    ADD COLUMN `parentId` INTEGER NULL,
    ADD COLUMN `size` VARCHAR(191) NULL,
    ADD COLUMN `sizeChartId` INTEGER NULL,
    ADD COLUMN `slug` VARCHAR(191) NULL,
    ADD COLUMN `sort` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `ProductImage` ADD COLUMN `color` VARCHAR(191) NULL,
    ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT 'image';

-- CreateTable
CREATE TABLE `SizeChart` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `data` TEXT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Batch` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `warehouseId` INTEGER NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `remaining` DOUBLE NOT NULL,
    `costPrice` DOUBLE NOT NULL DEFAULT 0,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `supplierId` INTEGER NULL,
    `receiptId` INTEGER NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Batch_productId_warehouseId_remaining_idx`(`productId`, `warehouseId`, `remaining`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BatchUse` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batchId` INTEGER NOT NULL,
    `saleItemId` INTEGER NULL,
    `quantity` DOUBLE NOT NULL,
    `returned` DOUBLE NOT NULL DEFAULT 0,
    `costPrice` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BatchUse_saleItemId_idx`(`saleItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Favorite` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Favorite_customerId_productId_key`(`customerId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockSubscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notifiedAt` DATETIME(3) NULL,

    UNIQUE INDEX `StockSubscription_customerId_productId_key`(`customerId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Review` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `customerId` INTEGER NOT NULL,
    `rating` INTEGER NOT NULL,
    `fit` VARCHAR(191) NULL,
    `size` VARCHAR(191) NULL,
    `text` TEXT NULL,
    `photos` TEXT NULL,
    `purchased` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `reply` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Review_productId_status_idx`(`productId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductLink` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `linkedId` INTEGER NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `ProductLink_productId_linkedId_key`(`productId`, `linkedId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Product_parentId_idx` ON `Product`(`parentId`);

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_sizeChartId_fkey` FOREIGN KEY (`sizeChartId`) REFERENCES `SizeChart`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_sizeChartId_fkey` FOREIGN KEY (`sizeChartId`) REFERENCES `SizeChart`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Batch` ADD CONSTRAINT `Batch_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BatchUse` ADD CONSTRAINT `BatchUse_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `Batch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Favorite` ADD CONSTRAINT `Favorite_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Favorite` ADD CONSTRAINT `Favorite_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockSubscription` ADD CONSTRAINT `StockSubscription_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockSubscription` ADD CONSTRAINT `StockSubscription_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductLink` ADD CONSTRAINT `ProductLink_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductLink` ADD CONSTRAINT `ProductLink_linkedId_fkey` FOREIGN KEY (`linkedId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Текущие остатки становятся начальными партиями по закупочной цене товара
INSERT INTO `Batch` (`productId`, `warehouseId`, `quantity`, `remaining`, `costPrice`, `date`, `note`, `createdAt`)
SELECT s.`productId`, s.`warehouseId`, s.`quantity`, s.`quantity`, p.`costPrice`, CURRENT_TIMESTAMP(3), 'Остаток на начало учёта партий', CURRENT_TIMESTAMP(3)
FROM `Stock` s JOIN `Product` p ON p.`id` = s.`productId`
WHERE s.`quantity` > 0;
