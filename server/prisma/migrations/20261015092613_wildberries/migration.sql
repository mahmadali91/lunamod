-- AlterTable
ALTER TABLE `Product` ADD COLUMN `packHeight` DOUBLE NULL,
    ADD COLUMN `packLength` DOUBLE NULL,
    ADD COLUMN `packWidth` DOUBLE NULL,
    ADD COLUMN `sizeRu` VARCHAR(191) NULL,
    ADD COLUMN `wbImtId` INTEGER NULL,
    ADD COLUMN `wbNmId` INTEGER NULL;

-- AlterTable
ALTER TABLE `ProductGroup` ADD COLUMN `wbImtId` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Product_wbNmId_key` ON `Product`(`wbNmId`);

-- CreateIndex
CREATE UNIQUE INDEX `ProductGroup_wbImtId_key` ON `ProductGroup`(`wbImtId`);

