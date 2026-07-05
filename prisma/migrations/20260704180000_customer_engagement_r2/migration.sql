-- Customer Engagement Engine R2 — persistencia

CREATE TYPE "EngagementDeliveryStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'SENT', 'SIMULATED', 'FAILED', 'CANCELLED');
CREATE TYPE "EngagementOutcomeType" AS ENUM ('OPENED', 'CLICKED', 'REPLIED', 'GOAL_COMPLETED', 'IGNORED', 'UNSUBSCRIBED', 'RSS_CONTRIBUTION');
CREATE TYPE "EngagementActiveJourneyStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'SUPERSEDED');

CREATE TABLE "EngagementDecisionRecord" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "recommendationCode" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "shouldCommunicate" BOOLEAN NOT NULL,
    "policyReason" TEXT NOT NULL,
    "journeyId" TEXT,
    "channel" TEXT,
    "templateId" TEXT,
    "decisionTrace" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementDecisionRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngagementDelivery" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "decisionId" TEXT,
    "recommendationId" TEXT NOT NULL,
    "recommendationCode" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "journeyStepId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "EngagementDeliveryStatus" NOT NULL DEFAULT 'SCHEDULED',
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

    CONSTRAINT "EngagementDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngagementOutcome" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "recommendationCode" TEXT NOT NULL,
    "type" "EngagementOutcomeType" NOT NULL,
    "rssBefore" INTEGER,
    "rssAfter" INTEGER,
    "rssDelta" INTEGER,
    "metadata" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementOutcome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngagementActiveJourney" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "journeyType" TEXT NOT NULL,
    "sourceRecommendationCode" TEXT NOT NULL,
    "sourceRecommendationId" TEXT NOT NULL,
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "status" "EngagementActiveJourneyStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastTouchAt" TIMESTAMP(3),

    CONSTRAINT "EngagementActiveJourney_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EngagementDecisionRecord_restaurantId_decidedAt_idx" ON "EngagementDecisionRecord"("restaurantId", "decidedAt");
CREATE INDEX "EngagementDecisionRecord_recommendationCode_idx" ON "EngagementDecisionRecord"("recommendationCode");

CREATE INDEX "EngagementDelivery_restaurantId_createdAt_idx" ON "EngagementDelivery"("restaurantId", "createdAt");
CREATE INDEX "EngagementDelivery_status_deliverAt_idx" ON "EngagementDelivery"("status", "deliverAt");
CREATE INDEX "EngagementDelivery_recommendationCode_idx" ON "EngagementDelivery"("recommendationCode");

CREATE INDEX "EngagementOutcome_deliveryId_idx" ON "EngagementOutcome"("deliveryId");
CREATE INDEX "EngagementOutcome_restaurantId_recordedAt_idx" ON "EngagementOutcome"("restaurantId", "recordedAt");

CREATE INDEX "EngagementActiveJourney_restaurantId_status_idx" ON "EngagementActiveJourney"("restaurantId", "status");
CREATE INDEX "EngagementActiveJourney_journeyId_status_idx" ON "EngagementActiveJourney"("journeyId", "status");

ALTER TABLE "EngagementDecisionRecord" ADD CONSTRAINT "EngagementDecisionRecord_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngagementDelivery" ADD CONSTRAINT "EngagementDelivery_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngagementDelivery" ADD CONSTRAINT "EngagementDelivery_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "EngagementDecisionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EngagementOutcome" ADD CONSTRAINT "EngagementOutcome_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "EngagementDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngagementOutcome" ADD CONSTRAINT "EngagementOutcome_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngagementActiveJourney" ADD CONSTRAINT "EngagementActiveJourney_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
