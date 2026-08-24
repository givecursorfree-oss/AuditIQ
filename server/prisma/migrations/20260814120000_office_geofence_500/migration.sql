-- Default office fence is 500m (was 200).
ALTER TABLE `Office` ALTER COLUMN `geofenceRadius` SET DEFAULT 500;
UPDATE `Office` SET `geofenceRadius` = 500;
