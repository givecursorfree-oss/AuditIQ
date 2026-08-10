-- Engagement letter scope + TimeEntry workType (schema was ahead of migrations)

SET @db := DATABASE();

-- Engagement.scopeIncluded
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Engagement' AND COLUMN_NAME = 'scopeIncluded'
    ),
    'SELECT 1',
    'ALTER TABLE `Engagement` ADD COLUMN `scopeIncluded` TEXT NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Engagement.scopeExcluded
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Engagement' AND COLUMN_NAME = 'scopeExcluded'
    ),
    'SELECT 1',
    'ALTER TABLE `Engagement` ADD COLUMN `scopeExcluded` TEXT NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- TimeEntry.workType
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'TimeEntry' AND COLUMN_NAME = 'workType'
    ),
    'SELECT 1',
    'ALTER TABLE `TimeEntry` ADD COLUMN `workType` VARCHAR(191) NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
