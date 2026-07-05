-- CreateEnum
CREATE TYPE "CommercialRelationStage" AS ENUM (
  'DISCOVERED',
  'LEAD',
  'LEAD_ENRICHED',
  'LEAD_QUALIFIED',
  'FIRST_CONTACT',
  'INTERESTED',
  'DEMO_REQUESTED',
  'DEMO_DONE',
  'FOLLOW_UP',
  'TRIAL',
  'CLIENT',
  'ACTIVE_CLIENT',
  'ADVANCED_CLIENT',
  'PROMOTER',
  'RECOVERY'
);

-- CreateTable
CREATE TABLE "CommercialRelation" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "convertedRestaurantId" TEXT,
    "name" TEXT NOT NULL,
    "stage" "CommercialRelationStage" NOT NULL DEFAULT 'LEAD',
    "primaryJob" TEXT,
    "signalSummary" TEXT,
    "nextAction" TEXT,
    "nextActionDue" TIMESTAMP(3),
    "intentScore" INTEGER NOT NULL DEFAULT 0,
    "opportunityScore" INTEGER NOT NULL DEFAULT 0,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "neighborhood" TEXT,
    "localType" TEXT,
    "branches" INTEGER NOT NULL DEFAULT 1,
    "presence" JSONB,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialRelationLog" (
    "id" TEXT NOT NULL,
    "relationId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "note" TEXT,
    "loggedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialRelationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommercialRelation_leadId_key" ON "CommercialRelation"("leadId");

-- CreateIndex
CREATE INDEX "CommercialRelation_stage_idx" ON "CommercialRelation"("stage");

-- CreateIndex
CREATE INDEX "CommercialRelation_ownerId_idx" ON "CommercialRelation"("ownerId");

-- CreateIndex
CREATE INDEX "CommercialRelation_nextActionDue_idx" ON "CommercialRelation"("nextActionDue");

-- CreateIndex
CREATE INDEX "CommercialRelation_priorityScore_idx" ON "CommercialRelation"("priorityScore");

-- CreateIndex
CREATE INDEX "CommercialRelation_convertedRestaurantId_idx" ON "CommercialRelation"("convertedRestaurantId");

-- CreateIndex
CREATE INDEX "CommercialRelationLog_relationId_createdAt_idx" ON "CommercialRelationLog"("relationId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommercialRelation" ADD CONSTRAINT "CommercialRelation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRelationLog" ADD CONSTRAINT "CommercialRelationLog_relationId_fkey" FOREIGN KEY ("relationId") REFERENCES "CommercialRelation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
