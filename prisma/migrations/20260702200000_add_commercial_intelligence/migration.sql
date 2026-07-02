-- CreateTable
CREATE TABLE "CommercialIntelligenceConfig" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "weights" JSONB NOT NULL,
    "segments" JSONB NOT NULL,
    "signals" JSONB NOT NULL,
    "thresholds" JSONB NOT NULL,
    "actions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialIntelligenceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialDecision" (
    "id" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "recommendedAction" JSONB NOT NULL,
    "chosenAction" JSONB,
    "expectedCostUsd" DECIMAL(12,8) NOT NULL,
    "expectedValueUsd" DECIMAL(12,8) NOT NULL,
    "expectedRoi" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "alternatives" JSONB,
    "goalId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialIntelligenceConfig_isActive_idx" ON "CommercialIntelligenceConfig"("isActive");

-- CreateIndex
CREATE INDEX "CommercialDecision_targetType_targetId_idx" ON "CommercialDecision"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "CommercialDecision_createdAt_idx" ON "CommercialDecision"("createdAt");

-- CreateIndex
CREATE INDEX "CommercialDecision_decisionType_idx" ON "CommercialDecision"("decisionType");
