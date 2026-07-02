-- CreateEnum
CREATE TYPE "AiGoalStatus" AS ENUM ('DRAFT', 'PLANNING', 'PLANNED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "ExecutionPlanStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "PlanStepStatus" AS ENUM ('PENDING', 'SKIPPED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'WAITING_DEPENDENCY', 'WAITING_APPROVAL');
CREATE TYPE "PlannerEventType" AS ENUM ('GOAL_CREATED', 'PLAN_BUILT', 'PLAN_APPROVED', 'PLAN_STARTED', 'STEP_CREATED', 'STEP_SKIPPED', 'STEP_STARTED', 'MODEL_SELECTED', 'COST_RECORDED', 'STEP_COMPLETED', 'STEP_FAILED', 'DECISION_MADE', 'GOAL_PAUSED', 'GOAL_RESUMED', 'GOAL_COMPLETED', 'GOAL_CANCELLED', 'INSIGHT_GENERATED');
CREATE TYPE "AiInsightCategory" AS ENUM ('COST', 'EFFICIENCY', 'ROI', 'BUDGET', 'PERFORMANCE', 'RECOMMENDATION');

-- AlterTable AiTask
ALTER TABLE "AiTask" ADD COLUMN "goalId" TEXT;
ALTER TABLE "AiTask" ADD COLUMN "planId" TEXT;
ALTER TABLE "AiTask" ADD COLUMN "planStepId" TEXT;
ALTER TABLE "AiTask" ADD COLUMN "dependsOnStepIds" JSONB;
ALTER TABLE "AiTask" ADD COLUMN "selectedModel" TEXT;
ALTER TABLE "AiTask" ADD COLUMN "skipReason" TEXT;

CREATE UNIQUE INDEX "AiTask_planStepId_key" ON "AiTask"("planStepId");
CREATE INDEX "AiTask_goalId_idx" ON "AiTask"("goalId");
CREATE INDEX "AiTask_planId_idx" ON "AiTask"("planId");

-- CreateTable AiGoal
CREATE TABLE "AiGoal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "goalType" TEXT NOT NULL,
    "status" "AiGoalStatus" NOT NULL DEFAULT 'DRAFT',
    "targetCount" INTEGER NOT NULL DEFAULT 1,
    "achievedCount" INTEGER NOT NULL DEFAULT 0,
    "budgetUsd" DECIMAL(10,4),
    "spentUsd" DECIMAL(12,8) NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(10,4),
    "estimatedDurationMs" INTEGER,
    "estimatedRoi" DOUBLE PRECISION,
    "actualRoi" DOUBLE PRECISION,
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "filters" JSONB,
    "constraints" JSONB,
    "priorities" JSONB,
    "createdById" TEXT,
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiGoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiGoal_status_createdAt_idx" ON "AiGoal"("status", "createdAt");
CREATE INDEX "AiGoal_createdById_idx" ON "AiGoal"("createdById");
CREATE INDEX "AiGoal_goalType_idx" ON "AiGoal"("goalType");

-- CreateTable ExecutionPlan
CREATE TABLE "ExecutionPlan" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "status" "ExecutionPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "summary" JSONB,
    "estimatedCostUsd" DECIMAL(10,4),
    "estimatedDurationMs" INTEGER,
    "estimatedConfidence" DOUBLE PRECISION,
    "actualCostUsd" DECIMAL(12,8) NOT NULL DEFAULT 0,
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "risks" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExecutionPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutionPlan_goalId_status_idx" ON "ExecutionPlan"("goalId", "status");
CREATE INDEX "ExecutionPlan_createdAt_idx" ON "ExecutionPlan"("createdAt");

-- CreateTable ExecutionPlanStep
CREATE TABLE "ExecutionPlanStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "PlanStepStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dependsOnStepIds" JSONB NOT NULL DEFAULT '[]',
    "input" JSONB,
    "output" JSONB,
    "selectedModel" TEXT,
    "estimatedCostUsd" DECIMAL(12,8),
    "estimatedDurationMs" INTEGER,
    "actualCostUsd" DECIMAL(12,8),
    "skipReason" TEXT,
    "reuseFromStepId" TEXT,
    "entityRef" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExecutionPlanStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutionPlanStep_planId_sortOrder_idx" ON "ExecutionPlanStep"("planId", "sortOrder");
CREATE INDEX "ExecutionPlanStep_status_idx" ON "ExecutionPlanStep"("status");
CREATE INDEX "ExecutionPlanStep_taskKey_idx" ON "ExecutionPlanStep"("taskKey");

-- CreateTable AiPlannerEvent
CREATE TABLE "AiPlannerEvent" (
    "id" TEXT NOT NULL,
    "goalId" TEXT,
    "planId" TEXT,
    "stepId" TEXT,
    "taskId" TEXT,
    "eventType" "PlannerEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" JSONB,
    "costUsd" DECIMAL(12,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiPlannerEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiPlannerEvent_goalId_createdAt_idx" ON "AiPlannerEvent"("goalId", "createdAt");
CREATE INDEX "AiPlannerEvent_planId_createdAt_idx" ON "AiPlannerEvent"("planId", "createdAt");
CREATE INDEX "AiPlannerEvent_eventType_idx" ON "AiPlannerEvent"("eventType");

-- CreateTable AiInsight
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "goalId" TEXT,
    "category" "AiInsightCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metricKey" TEXT,
    "metricValue" DOUBLE PRECISION,
    "impactUsd" DECIMAL(12,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiInsight_goalId_createdAt_idx" ON "AiInsight"("goalId", "createdAt");
CREATE INDEX "AiInsight_category_idx" ON "AiInsight"("category");

-- ForeignKeys
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "AiGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ExecutionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_planStepId_fkey" FOREIGN KEY ("planStepId") REFERENCES "ExecutionPlanStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExecutionPlan" ADD CONSTRAINT "ExecutionPlan_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "AiGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutionPlanStep" ADD CONSTRAINT "ExecutionPlanStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ExecutionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiPlannerEvent" ADD CONSTRAINT "AiPlannerEvent_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "AiGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiPlannerEvent" ADD CONSTRAINT "AiPlannerEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ExecutionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "AiGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
