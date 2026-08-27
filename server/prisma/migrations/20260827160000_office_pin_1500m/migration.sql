-- Update Office GPS pin to 13.076222, 80.237540 and increase radius to 1500m
UPDATE `Office`
SET `latitude` = 13.076222,
    `longitude` = 80.237540,
    `geofenceRadius` = 1500
WHERE `id` IS NOT NULL;
