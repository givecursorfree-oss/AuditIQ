-- Article Assistant attendance policy fields (HR Aug 2026)
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "lateBand" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "clientName" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "bioPresent" BOOLEAN;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "forgiven" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "forgivenReason" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "forgivenById" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "wfhApprovedById" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "gpsAccuracy" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "Attendance_userId_date_idx" ON "Attendance"("userId", "date");

CREATE TABLE IF NOT EXISTS "WfhApproval" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "approvedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WfhApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WfhApproval_userId_date_key" ON "WfhApproval"("userId", "date");
CREATE INDEX IF NOT EXISTS "WfhApproval_userId_idx" ON "WfhApproval"("userId");

ALTER TABLE "ArticleshipRecord" ADD COLUMN IF NOT EXISTS "firmLeaveCredit" DOUBLE PRECISION NOT NULL DEFAULT 24;
