-- Absolute session tracking (login → force re-auth after SESSION_ABSOLUTE_MS even if refresh is valid)
ALTER TABLE `User` ADD COLUMN `sessionStartedAt` DATETIME(3) NULL;
