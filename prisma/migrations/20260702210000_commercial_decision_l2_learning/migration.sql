-- AlterTable
ALTER TABLE "CommercialDecision" ADD COLUMN "executedPlanId" TEXT,
ADD COLUMN "autonomyLevel" TEXT,
ADD COLUMN "actualCostUsd" DECIMAL(12,8),
ADD COLUMN "outcomeStatus" TEXT,
ADD COLUMN "outcomeAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CommercialDecision_goalId_idx" ON "CommercialDecision"("goalId");
