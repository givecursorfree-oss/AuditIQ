-- Queued email records have no retry worker and must not remain pending.
DELETE FROM `CommsLog`
WHERE `channel` = 'email' AND `status` = 'queued';

ALTER TABLE `CommsLog`
  ALTER COLUMN `status` SET DEFAULT 'failed';
