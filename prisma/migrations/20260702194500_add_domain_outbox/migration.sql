-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "DomainOutbox" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainEventProcessed" (
    "id" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "handlerKey" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEventProcessed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainOutbox_status_availableAt_idx" ON "DomainOutbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "DomainOutbox_eventType_createdAt_idx" ON "DomainOutbox"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "DomainOutbox_aggregateType_aggregateId_idx" ON "DomainOutbox"("aggregateType", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainEventProcessed_outboxId_handlerKey_key" ON "DomainEventProcessed"("outboxId", "handlerKey");

-- CreateIndex
CREATE INDEX "DomainEventProcessed_handlerKey_idx" ON "DomainEventProcessed"("handlerKey");
