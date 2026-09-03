-- Claims V1: Food + Travel staff claims, batches, audit trail

-- Alter ExpenseClaim for V1 spec
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "claimType" TEXT NOT NULL DEFAULT 'food';
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "approvedAmount" DECIMAL(12,2);
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "workType" TEXT NOT NULL DEFAULT 'Audit';
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "workTypeOther" TEXT;
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "claimStatus" TEXT NOT NULL DEFAULT 'pending_approval';
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "processingStatus" TEXT NOT NULL DEFAULT 'unprocessed';
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "policyFlags" JSONB;
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "rejectReasonInternal" TEXT;
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "partialApproveReason" TEXT;
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "batchId" TEXT;
ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Migrate legacy status → claimStatus + processingStatus
UPDATE "ExpenseClaim" SET "claimStatus" = 'pending_approval', "processingStatus" = 'unprocessed' WHERE "status" = 'submitted';
UPDATE "ExpenseClaim" SET "claimStatus" = 'approved', "processingStatus" = 'unprocessed' WHERE "status" = 'manager_approved';
UPDATE "ExpenseClaim" SET "claimStatus" = 'approved', "processingStatus" = 'paid' WHERE "status" = 'paid';
UPDATE "ExpenseClaim" SET "claimStatus" = 'rejected', "processingStatus" = 'unprocessed' WHERE "status" = 'rejected';
UPDATE "ExpenseClaim" SET "claimType" = 'food' WHERE "category" IS NOT NULL;

-- Backfill clientId from engagement where missing
UPDATE "ExpenseClaim" ec
SET "clientId" = e."clientId"
FROM "Engagement" e
WHERE ec."engagementId" = e."id" AND ec."clientId" IS NULL;

-- Make lateHoursClaimId optional (drop NOT NULL if exists)
ALTER TABLE "ExpenseClaim" ALTER COLUMN "lateHoursClaimId" DROP NOT NULL;

-- Drop legacy columns after migration
ALTER TABLE "ExpenseClaim" DROP COLUMN IF EXISTS "category";
ALTER TABLE "ExpenseClaim" DROP COLUMN IF EXISTS "status";
ALTER TABLE "ExpenseClaim" DROP COLUMN IF EXISTS "managerNotes";

-- engagementId required for new claims; leave nullable for legacy rows
-- clientId FK
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ExpenseClaim_claimStatus_idx" ON "ExpenseClaim"("claimStatus");
CREATE INDEX IF NOT EXISTS "ExpenseClaim_processingStatus_idx" ON "ExpenseClaim"("processingStatus");
CREATE INDEX IF NOT EXISTS "ExpenseClaim_batchId_idx" ON "ExpenseClaim"("batchId");
CREATE INDEX IF NOT EXISTS "ExpenseClaim_claimType_idx" ON "ExpenseClaim"("claimType");

-- ClaimBatch
CREATE TABLE IF NOT EXISTS "ClaimBatch" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "batchType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "partnerApprovedById" TEXT,
    "partnerApprovedAt" TIMESTAMP(3),
    "accountsApprovedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClaimBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClaimBatch_firmId_idx" ON "ClaimBatch"("firmId");
CREATE INDEX IF NOT EXISTS "ClaimBatch_status_idx" ON "ClaimBatch"("status");

ALTER TABLE "ClaimBatch" ADD CONSTRAINT "ClaimBatch_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimBatch" ADD CONSTRAINT "ClaimBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClaimBatch" ADD CONSTRAINT "ClaimBatch_partnerApprovedById_fkey" FOREIGN KEY ("partnerApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ClaimBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ClaimAuditEvent
CREATE TABLE IF NOT EXISTS "ClaimAuditEvent" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "batchId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClaimAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClaimAuditEvent_claimId_idx" ON "ClaimAuditEvent"("claimId");
CREATE INDEX IF NOT EXISTS "ClaimAuditEvent_batchId_idx" ON "ClaimAuditEvent"("batchId");

ALTER TABLE "ClaimAuditEvent" ADD CONSTRAINT "ClaimAuditEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimAuditEvent" ADD CONSTRAINT "ClaimAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
