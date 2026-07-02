-- CreateEnum
CREATE TYPE "LeadAnalysisApprovalStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_APPROVAL');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('GEMINI', 'OPENAI', 'ANTHROPIC', 'OPENROUTER', 'GROQ', 'DEEPSEEK');

-- AlterTable LeadAnalysis
ALTER TABLE "LeadAnalysis" ADD COLUMN "aiTaskId" TEXT;
ALTER TABLE "LeadAnalysis" ADD COLUMN "aiExecutionId" TEXT;
ALTER TABLE "LeadAnalysis" ADD COLUMN "approvalStatus" "LeadAnalysisApprovalStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "LeadAnalysis" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "LeadAnalysis" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "LeadAnalysis" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "LeadAnalysis" ADD COLUMN "costUsd" DECIMAL(12,8);
ALTER TABLE "LeadAnalysis" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "LeadAnalysis" ADD COLUMN "confidence" DOUBLE PRECISION;

CREATE INDEX "LeadAnalysis_approvalStatus_idx" ON "LeadAnalysis"("approvalStatus");

-- AlterTable LeadSavedSearch
ALTER TABLE "LeadSavedSearch" ADD COLUMN "campaignLabel" TEXT;
ALTER TABLE "LeadSavedSearch" ADD COLUMN "totalCostUsd" DECIMAL(12,8);
ALTER TABLE "LeadSavedSearch" ADD COLUMN "taskCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeadSavedSearch" ADD COLUMN "leadCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable AiModelPricing
CREATE TABLE "AiModelPricing" (
    "id" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "inputPerMillion" DECIMAL(12,6) NOT NULL,
    "outputPerMillion" DECIMAL(12,6) NOT NULL,
    "reasoningPerMillion" DECIMAL(12,6),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AiModelPricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiModelPricing_provider_model_effectiveFrom_key" ON "AiModelPricing"("provider", "model", "effectiveFrom");
CREATE INDEX "AiModelPricing_provider_model_isActive_idx" ON "AiModelPricing"("provider", "model", "isActive");

-- CreateTable AiTaskExecution
CREATE TABLE "AiTaskExecution" (
    "id" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "provider" "AiProvider",
    "model" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "inputCostUsd" DECIMAL(12,8) NOT NULL DEFAULT 0,
    "outputCostUsd" DECIMAL(12,8) NOT NULL DEFAULT 0,
    "totalCostUsd" DECIMAL(12,8) NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "cacheSavedUsd" DECIMAL(12,8),
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "leadId" TEXT,
    "savedSearchId" TEXT,
    "userId" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTaskExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiTaskExecution_leadId_executedAt_idx" ON "AiTaskExecution"("leadId", "executedAt");
CREATE INDEX "AiTaskExecution_savedSearchId_executedAt_idx" ON "AiTaskExecution"("savedSearchId", "executedAt");
CREATE INDEX "AiTaskExecution_userId_executedAt_idx" ON "AiTaskExecution"("userId", "executedAt");
CREATE INDEX "AiTaskExecution_taskKey_executedAt_idx" ON "AiTaskExecution"("taskKey", "executedAt");
CREATE INDEX "AiTaskExecution_executedAt_idx" ON "AiTaskExecution"("executedAt");

-- CreateTable AiTask
CREATE TABLE "AiTask" (
    "id" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "status" "AiTaskStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" JSONB,
    "leadId" TEXT,
    "savedSearchId" TEXT,
    "createdById" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "parentTaskId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "executionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiTask_executionId_key" ON "AiTask"("executionId");
CREATE INDEX "AiTask_status_scheduledAt_idx" ON "AiTask"("status", "scheduledAt");
CREATE INDEX "AiTask_leadId_idx" ON "AiTask"("leadId");
CREATE INDEX "AiTask_savedSearchId_idx" ON "AiTask"("savedSearchId");
CREATE INDEX "AiTask_taskKey_createdAt_idx" ON "AiTask"("taskKey", "createdAt");

ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "LeadSavedSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AiTaskExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable AiCostBudget
CREATE TABLE "AiCostBudget" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "dailyLimitUsd" DECIMAL(10,4),
    "monthlyLimitUsd" DECIMAL(10,4),
    "hardStop" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCostBudget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCostBudget_scope_key" ON "AiCostBudget"("scope");

-- Seed default Gemini pricing
INSERT INTO "AiModelPricing" ("id", "provider", "model", "inputPerMillion", "outputPerMillion", "reasoningPerMillion", "currency", "effectiveFrom", "isActive")
VALUES
  ('pricing_gemini_25_flash_lite', 'GEMINI', 'gemini-2.5-flash-lite', 0.075000, 0.300000, NULL, 'USD', CURRENT_TIMESTAMP, true),
  ('pricing_gemini_25_flash', 'GEMINI', 'gemini-2.5-flash', 0.150000, 0.600000, NULL, 'USD', CURRENT_TIMESTAMP, true);

-- Seed global budget (soft defaults)
INSERT INTO "AiCostBudget" ("id", "scope", "dailyLimitUsd", "monthlyLimitUsd", "hardStop", "updatedAt")
VALUES ('budget_global', 'global', 10.0000, 200.0000, false, CURRENT_TIMESTAMP);
