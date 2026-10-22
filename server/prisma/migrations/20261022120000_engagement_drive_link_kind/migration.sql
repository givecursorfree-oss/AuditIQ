-- Engagement Drive links: Shared Drive OR Shared Folder (switchable later via re-link)
ALTER TABLE `EngagementDriveFolder` ADD COLUMN `linkKind` VARCHAR(191) NOT NULL DEFAULT 'SHARED_DRIVE';

-- Existing rows are Shared Drive folders; keep driveId. New Shared Folder links may omit driveId.
ALTER TABLE `EngagementDriveFolder` MODIFY `driveId` VARCHAR(191) NULL;

CREATE INDEX `EngagementDriveFolder_linkKind_idx` ON `EngagementDriveFolder`(`linkKind`);
