-- AlterTable
ALTER TABLE "Firm" ADD COLUMN "expenseSubmissionWindowDays" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "lateHoursClaimId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "expenseDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "engagementId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "managerReviewedById" TEXT,
    "managerReviewedAt" TIMESTAMP(3),
    "managerNotes" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "paymentMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseClaimReceipt" (
    "id" TEXT NOT NULL,
    "expenseClaimId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseClaimReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseClaim_lateHoursClaimId_key" ON "ExpenseClaim"("lateHoursClaimId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_firmId_idx" ON "ExpenseClaim"("firmId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_staffId_idx" ON "ExpenseClaim"("staffId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_status_idx" ON "ExpenseClaim"("status");

-- CreateIndex
CREATE INDEX "ExpenseClaim_expenseDate_idx" ON "ExpenseClaim"("expenseDate");

-- CreateIndex
CREATE INDEX "ExpenseClaimReceipt_expenseClaimId_idx" ON "ExpenseClaimReceipt"("expenseClaimId");

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_lateHoursClaimId_fkey" FOREIGN KEY ("lateHoursClaimId") REFERENCES "LateHoursClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_managerReviewedById_fkey" FOREIGN KEY ("managerReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaimReceipt" ADD CONSTRAINT "ExpenseClaimReceipt_expenseClaimId_fkey" FOREIGN KEY ("expenseClaimId") REFERENCES "ExpenseClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
