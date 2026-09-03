/**
 * Idempotent schema repair when migrate deploy / db push fail (e.g. P3005, Task index conflict).
 * Applies pending-features DDL only for missing columns/tables/indexes.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    index
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function safe(sql: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (err) {
    const msg = (err as Error).message || '';
    if (/Duplicate column|already exists|Duplicate key name/i.test(msg)) return;
    throw err;
  }
}

async function main(): Promise<void> {
  console.log('[apply-pending-schema] Checking pending-features schema…');

  if (!(await columnExists('User', 'notifyDailyDigest'))) {
    await safe('ALTER TABLE `User` ADD COLUMN `notifyDailyDigest` BOOLEAN NOT NULL DEFAULT true');
  }
  if (!(await columnExists('User', 'lastDigestSentAt'))) {
    await safe('ALTER TABLE `User` ADD COLUMN `lastDigestSentAt` DATETIME(3) NULL');
  }
  if (!(await columnExists('User', 'sessionStartedAt'))) {
    await safe('ALTER TABLE `User` ADD COLUMN `sessionStartedAt` DATETIME(3) NULL');
  }
  if (!(await columnExists('Engagement', 'teamLastChangedById'))) {
    await safe('ALTER TABLE `Engagement` ADD COLUMN `teamLastChangedById` VARCHAR(191) NULL');
    await safe('ALTER TABLE `Engagement` ADD COLUMN `teamLastChangedAt` DATETIME(3) NULL');
    if (!(await indexExists('Engagement', 'Engagement_teamLastChangedById_idx'))) {
      await safe('CREATE INDEX `Engagement_teamLastChangedById_idx` ON `Engagement`(`teamLastChangedById`)');
    }
    await safe(
      'ALTER TABLE `Engagement` ADD CONSTRAINT `Engagement_teamLastChangedById_fkey` FOREIGN KEY (`teamLastChangedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'
    );
  }
  if (!(await columnExists('EngagementMember', 'teamRole'))) {
    await safe('ALTER TABLE `EngagementMember` ADD COLUMN `teamRole` VARCHAR(191) NULL');
    if (!(await indexExists('EngagementMember', 'EngagementMember_teamRole_idx'))) {
      await safe('CREATE INDEX `EngagementMember_teamRole_idx` ON `EngagementMember`(`teamRole`)');
    }
  }
  if (!(await columnExists('EngagementMember', 'sortOrder'))) {
    await safe('ALTER TABLE `EngagementMember` ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0');
  }
  if (!(await columnExists('Task', 'proposedTimeline'))) {
    await safe('ALTER TABLE `Task` ADD COLUMN `proposedTimeline` VARCHAR(191) NULL');
    await safe('ALTER TABLE `Task` ADD COLUMN `estimatedHours` DOUBLE NULL');
    await safe('ALTER TABLE `Task` ADD COLUMN `notes` TEXT NULL');
    // FK on engagementId already indexes the column — skip Task_engagementId_idx to avoid db push conflict
    await safe("UPDATE `Task` SET `status` = 'not_started' WHERE `status` = 'Open'");
    await safe("UPDATE `Task` SET `status` = 'in_progress' WHERE `status` = 'In Progress'");
    await safe("UPDATE `Task` SET `status` = 'completed' WHERE `status` IN ('Done', 'Cancelled')");
  }
  if (!(await columnExists('TimeEntry', 'taskId'))) {
    await safe('ALTER TABLE `TimeEntry` ADD COLUMN `taskId` VARCHAR(191) NULL');
    if (!(await indexExists('TimeEntry', 'TimeEntry_taskId_idx'))) {
      await safe('CREATE INDEX `TimeEntry_taskId_idx` ON `TimeEntry`(`taskId`)');
    }
    await safe(
      'ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'
    );
  }
  if (!(await columnExists('ClientStopwatch', 'taskId'))) {
    await safe('ALTER TABLE `ClientStopwatch` ADD COLUMN `taskId` VARCHAR(191) NULL');
    if (!(await indexExists('ClientStopwatch', 'ClientStopwatch_taskId_idx'))) {
      await safe('CREATE INDEX `ClientStopwatch_taskId_idx` ON `ClientStopwatch`(`taskId`)');
    }
  }
  if (!(await columnExists('PasswordVaultEntry', 'lastSyncedAt'))) {
    await safe('ALTER TABLE `PasswordVaultEntry` ADD COLUMN `lastSyncedAt` DATETIME(3) NULL');
  }

  if (!(await tableExists('RecurringSchedule'))) {
    await safe(`CREATE TABLE \`RecurringSchedule\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`engagementTemplateId\` VARCHAR(191) NOT NULL,
      \`clientId\` VARCHAR(191) NOT NULL,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,
      \`frequency\` VARCHAR(191) NOT NULL,
      \`triggerDay\` INTEGER NULL,
      \`triggerDates\` TEXT NULL,
      \`triggerMonth\` VARCHAR(191) NULL,
      \`autoCreateStartDate\` DATETIME(3) NOT NULL,
      \`autoCreateEndDate\` DATETIME(3) NULL,
      \`autoSendDataRequestLetter\` BOOLEAN NOT NULL DEFAULT true,
      \`lastCreatedAt\` DATETIME(3) NULL,
      \`nextCreateAt\` DATETIME(3) NULL,
      \`createdById\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      UNIQUE INDEX \`RecurringSchedule_clientId_engagementTemplateId_key\`(\`clientId\`, \`engagementTemplateId\`),
      INDEX \`RecurringSchedule_clientId_idx\`(\`clientId\`),
      INDEX \`RecurringSchedule_isActive_idx\`(\`isActive\`),
      INDEX \`RecurringSchedule_nextCreateAt_idx\`(\`nextCreateAt\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await safe(
      'ALTER TABLE `RecurringSchedule` ADD CONSTRAINT `RecurringSchedule_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'
    );
    await safe(
      'ALTER TABLE `RecurringSchedule` ADD CONSTRAINT `RecurringSchedule_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
    );
  }

  if (!(await tableExists('LateHoursClaim'))) {
    await safe(`CREATE TABLE \`LateHoursClaim\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`staffId\` VARCHAR(191) NOT NULL,
      \`date\` DATE NOT NULL,
      \`normalEndTime\` VARCHAR(191) NOT NULL,
      \`actualEndTime\` VARCHAR(191) NOT NULL,
      \`computerLogoffTime\` VARCHAR(191) NULL,
      \`fingerprintLogoffTime\` VARCHAR(191) NULL,
      \`hoursOvertime\` DOUBLE NOT NULL,
      \`reason\` TEXT NOT NULL,
      \`engagementId\` VARCHAR(191) NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'pending',
      \`reviewedById\` VARCHAR(191) NULL,
      \`reviewedAt\` DATETIME(3) NULL,
      \`managerNotes\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX \`LateHoursClaim_staffId_idx\`(\`staffId\`),
      INDEX \`LateHoursClaim_status_idx\`(\`status\`),
      INDEX \`LateHoursClaim_date_idx\`(\`date\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await safe(
      'ALTER TABLE `LateHoursClaim` ADD CONSTRAINT `LateHoursClaim_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
    );
    await safe(
      'ALTER TABLE `LateHoursClaim` ADD CONSTRAINT `LateHoursClaim_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'
    );
    await safe(
      'ALTER TABLE `LateHoursClaim` ADD CONSTRAINT `LateHoursClaim_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'
    );
  }

  if (!(await tableExists('DeptVisitClaim'))) {
    await safe(`CREATE TABLE \`DeptVisitClaim\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`staffId\` VARCHAR(191) NOT NULL,
      \`date\` DATE NOT NULL,
      \`department\` VARCHAR(191) NOT NULL,
      \`departmentDetails\` TEXT NOT NULL,
      \`purpose\` TEXT NOT NULL,
      \`engagementId\` VARCHAR(191) NOT NULL,
      \`travelExpense\` DOUBLE NULL,
      \`receiptUrl\` VARCHAR(191) NULL,
      \`departureTime\` VARCHAR(191) NOT NULL,
      \`returnTime\` VARCHAR(191) NOT NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'pending',
      \`reviewedById\` VARCHAR(191) NULL,
      \`reviewedAt\` DATETIME(3) NULL,
      \`managerNotes\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX \`DeptVisitClaim_staffId_idx\`(\`staffId\`),
      INDEX \`DeptVisitClaim_status_idx\`(\`status\`),
      INDEX \`DeptVisitClaim_engagementId_idx\`(\`engagementId\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await safe(
      'ALTER TABLE `DeptVisitClaim` ADD CONSTRAINT `DeptVisitClaim_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
    );
    await safe(
      'ALTER TABLE `DeptVisitClaim` ADD CONSTRAINT `DeptVisitClaim_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
    );
    await safe(
      'ALTER TABLE `DeptVisitClaim` ADD CONSTRAINT `DeptVisitClaim_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'
    );
  }

  if (!(await tableExists('GovernmentNotice'))) {
    await safe(`CREATE TABLE \`GovernmentNotice\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`clientId\` VARCHAR(191) NOT NULL,
      \`portal\` VARCHAR(191) NOT NULL,
      \`noticeType\` VARCHAR(191) NOT NULL,
      \`adjudicationLevel\` VARCHAR(191) NULL,
      \`referenceNumber\` VARCHAR(191) NULL,
      \`dateOfNotice\` DATE NULL,
      \`dueDate\` DATE NULL,
      \`subject\` TEXT NOT NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'pending',
      \`engagementId\` VARCHAR(191) NULL,
      \`fetchedAt\` DATETIME(3) NULL,
      \`rawData\` JSON NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      INDEX \`GovernmentNotice_clientId_idx\`(\`clientId\`),
      INDEX \`GovernmentNotice_portal_idx\`(\`portal\`),
      INDEX \`GovernmentNotice_status_idx\`(\`status\`),
      INDEX \`GovernmentNotice_dueDate_idx\`(\`dueDate\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await safe(
      'ALTER TABLE `GovernmentNotice` ADD CONSTRAINT `GovernmentNotice_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'
    );
    await safe(
      'ALTER TABLE `GovernmentNotice` ADD CONSTRAINT `GovernmentNotice_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'
    );
  }

  console.log('[apply-pending-schema] Schema repair complete.');
}

main()
  .catch((err) => {
    console.error('[apply-pending-schema] Failed:', (err as Error).message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
