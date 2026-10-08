-- Remove exact duplicate active leave rows (keep the earliest createdAt).
-- Caused by unguarded double-submit before overlap lock on POST /leaves.
DELETE lr FROM `LeaveRequest` lr
INNER JOIN `LeaveRequest` keeper
  ON lr.`userId` = keeper.`userId`
  AND lr.`fromDate` = keeper.`fromDate`
  AND lr.`toDate` = keeper.`toDate`
  AND lr.`type` = keeper.`type`
  AND lr.`halfDay` = keeper.`halfDay`
  AND lr.`status` = keeper.`status`
  AND lr.`createdAt` > keeper.`createdAt`
WHERE lr.`status` IN ('Pending', 'Manager Approved');
