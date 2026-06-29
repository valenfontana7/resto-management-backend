-- CreateEnum
CREATE TYPE "BusinessEventImportance" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BusinessEventReplayPolicy" AS ENUM ('FULL', 'SUMMARY', 'SKIP');

-- CreateTable
CREATE TABLE "BusinessEvent" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "importance" "BusinessEventImportance" NOT NULL DEFAULT 'NORMAL',
    "replayPolicy" "BusinessEventReplayPolicy" NOT NULL DEFAULT 'FULL',
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessEvent_restaurantId_occurredAt_idx" ON "BusinessEvent"("restaurantId", "occurredAt");

-- CreateIndex
CREATE INDEX "BusinessEvent_restaurantId_eventType_occurredAt_idx" ON "BusinessEvent"("restaurantId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "BusinessEvent_correlationId_idx" ON "BusinessEvent"("correlationId");

-- AddForeignKey
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
