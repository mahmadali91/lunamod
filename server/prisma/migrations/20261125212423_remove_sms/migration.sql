-- AlterTable
ALTER TABLE `Customer` DROP COLUMN `authMethod`,
    DROP COLUMN `marketingSms`;

-- DropTable
DROP TABLE `SmsCode`;


-- чистим настройки SMS
DELETE FROM `Setting` WHERE `key` IN ('smsMode','smsruApiId','smsSender','smsPrice','remindSms');
