-- Claim batch: draft → sent (Sent / Pending Approval history)

UPDATE `ClaimBatch` SET `status` = 'sent' WHERE `status` = 'draft';
