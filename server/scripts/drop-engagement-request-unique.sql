-- Allow multiple engagements per client request (per-service approve).
-- Safe to run multiple times: drops unique index only if it exists.
SET @idx := (
  SELECT INDEX_NAME
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Engagement'
    AND COLUMN_NAME = 'clientRequestId'
    AND NON_UNIQUE = 0
  LIMIT 1
);
SET @sql := IF(
  @idx IS NOT NULL,
  CONCAT('ALTER TABLE `Engagement` DROP INDEX `', @idx, '`'),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
