-- DropIndex
DROP INDEX `Customer_birthDate_idx` ON `Customer`;

-- AlterTable
ALTER TABLE `Customer` DROP COLUMN `birthDate`,
    DROP COLUMN `gender`;

