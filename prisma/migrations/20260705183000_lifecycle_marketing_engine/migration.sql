-- CreateEnum
CREATE TYPE "LifecycleDeliveryStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'SENT', 'SIMULATED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LifecycleOutcomeType" AS ENUM ('SENT', 'OPENED', 'CLICKED', 'REPLIED', 'GOAL_COMPLETED', 'IGNORED', 'UNSUBSCRIBED', 'RSS_CONTRIBUTION', 'JOURNEY_COMPLETED');

-- CreateEnum
CREATE TYPE "LifecycleActiveCampaignStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "LifecycleCampaignRun" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignType" TEXT NOT NULL,
    "recommendationCode" TEXT,
    "opportunityCode" TEXT,
    "shouldCommunicate" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "intelligenceBacked" BOOLEAN NOT NULL DEFAULT true,
    "channel" TEXT,
    "templateId" TEXT,
    "decisionTrace" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LifecycleCampaignRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifecycleDelivery" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "campaignRunId" TEXT,
    "campaignId" TEXT NOT NULL,
    "campaignType" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "recommendationCode" TEXT,
    "opportunityCode" TEXT,
    "templateId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "LifecycleDeliveryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "recipient" TEXT,
    "subject" TEXT,
    "bodyPreview" TEXT NOT NULL,
    "bodyFull" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "deliverAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "externalMessageId" TEXT,
    "errorMessage" TEXT,
    "engineVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifecycleDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifecycleOutcome" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignType" TEXT NOT NULL,
    "type" "LifecycleOutcomeType" NOT NULL,
    "rssBefore" INTEGER,
    "rssAfter" INTEGER,
    "rssDelta" INTEGER,
    "metadata" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LifecycleOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifecycleActiveCampaign" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignType" TEXT NOT NULL,
    "sourceRecommendationCode" TEXT,
    "sourceOpportunityCode" TEXT,
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "status" "LifecycleActiveCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastTouchAt" TIMESTAMP(3),

    CONSTRAINT "LifecycleActiveCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LifecycleCampaignRun_restaurantId_decidedAt_idx" ON "LifecycleCampaignRun"("restaurantId", "decidedAt");

-- CreateIndex
CREATE INDEX "LifecycleCampaignRun_campaignId_idx" ON "LifecycleCampaignRun"("campaignId");

-- CreateIndex
CREATE INDEX "LifecycleDelivery_restaurantId_createdAt_idx" ON "LifecycleDelivery"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "LifecycleDelivery_status_deliverAt_idx" ON "LifecycleDelivery"("status", "deliverAt");

-- CreateIndex
CREATE INDEX "LifecycleDelivery_campaignId_idx" ON "LifecycleDelivery"("campaignId");

-- CreateIndex
CREATE INDEX "LifecycleOutcome_deliveryId_idx" ON "LifecycleOutcome"("deliveryId");

-- CreateIndex
CREATE INDEX "LifecycleOutcome_restaurantId_recordedAt_idx" ON "LifecycleOutcome"("restaurantId", "recordedAt");

-- CreateIndex
CREATE INDEX "LifecycleActiveCampaign_restaurantId_status_idx" ON "LifecycleActiveCampaign"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "LifecycleActiveCampaign_campaignId_status_idx" ON "LifecycleActiveCampaign"("campaignId", "status");

-- AddForeignKey
ALTER TABLE "LifecycleCampaignRun" ADD CONSTRAINT "LifecycleCampaignRun_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleDelivery" ADD CONSTRAINT "LifecycleDelivery_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleDelivery" ADD CONSTRAINT "LifecycleDelivery_campaignRunId_fkey" FOREIGN KEY ("campaignRunId") REFERENCES "LifecycleCampaignRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleOutcome" ADD CONSTRAINT "LifecycleOutcome_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "LifecycleDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleOutcome" ADD CONSTRAINT "LifecycleOutcome_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleActiveCampaign" ADD CONSTRAINT "LifecycleActiveCampaign_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
