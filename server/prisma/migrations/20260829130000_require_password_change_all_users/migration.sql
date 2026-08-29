-- Require every existing active account to replace its current password once.
-- This preserves all user, attendance, client, and firm data.
UPDATE `User`
SET `mustChangePassword` = true
WHERE `isActive` = true;
