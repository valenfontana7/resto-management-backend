-- CreateEnum
CREATE TYPE "IntelligenceStateKind" AS ENUM ('SIGNALS', 'OPPORTUNITIES', 'RECOMMENDATIONS');

-- CreateEnum
CREATE TYPE "BriefingFeedbackKind" AS ENUM ('DISMISSED', 'SNOOZED');

-- CreateTable
CREATE TABLE "RestaurantIntelligenceState" (
    "restaurantId" TEXT NOT NULL,
    "kind" "IntelligenceStateKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantIntelligenceState_pkey" PRIMARY KEY ("restaurantId","kind")
);

-- CreateTable
CREATE TABLE "RestaurantRssHistoryEntry" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "band" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantRssHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingFeedback" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "kind" "BriefingFeedbackKind" NOT NULL,
    "snoozedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefingFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestaurantRssHistoryEntry_restaurantId_computedAt_idx" ON "RestaurantRssHistoryEntry"("restaurantId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BriefingFeedback_restaurantId_preparationId_key" ON "BriefingFeedback"("restaurantId", "preparationId");

-- CreateIndex
CREATE INDEX "BriefingFeedback_restaurantId_expiresAt_idx" ON "BriefingFeedback"("restaurantId", "expiresAt");

-- AddForeignKey
ALTER TABLE "RestaurantIntelligenceState" ADD CONSTRAINT "RestaurantIntelligenceState_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRssHistoryEntry" ADD CONSTRAINT "RestaurantRssHistoryEntry_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingFeedback" ADD CONSTRAINT "BriefingFeedback_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
