-- CreateEnum
CREATE TYPE "OperationShiftStatus" AS ENUM ('PLANNED', 'OPEN', 'CLOSING', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationShiftSegment" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CoordinationType" AS ENUM ('TASK', 'HEADS_UP', 'HELP_REQUEST', 'APPROVAL', 'INCIDENT');

-- CreateEnum
CREATE TYPE "CoordinationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CoordinationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CoordinationOriginKind" AS ENUM ('EVENT', 'HUMAN', 'INTELLIGENCE');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ACCEPTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "OperationShift" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "segment" "OperationShiftSegment" NOT NULL DEFAULT 'EVENING',
    "label" TEXT,
    "status" "OperationShiftStatus" NOT NULL DEFAULT 'PLANNED',
    "assignments" JSONB NOT NULL DEFAULT '[]',
    "dailyOperationId" TEXT,
    "openedAt" TIMESTAMP(3),
    "openedByUserId" TEXT,
    "closingStartedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coordination" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "type" "CoordinationType" NOT NULL,
    "status" "CoordinationStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "CoordinationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contextRef" JSONB NOT NULL,
    "origin" JSONB NOT NULL,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "attentionLevel" INTEGER NOT NULL DEFAULT 1,
    "ackDeadlineAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "escalatedToShiftLead" BOOLEAN NOT NULL DEFAULT false,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "comments" JSONB NOT NULL DEFAULT '[]',
    "result" JSONB,
    "policyDedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coordination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handoff" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "fromShiftId" TEXT NOT NULL,
    "toShiftId" TEXT,
    "status" "HandoffStatus" NOT NULL DEFAULT 'DRAFT',
    "sections" JSONB NOT NULL DEFAULT '[]',
    "transferredCoordinationIds" JSONB NOT NULL DEFAULT '[]',
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Handoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEpisode" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "coordinationId" TEXT,
    "coordinationType" TEXT,
    "situationId" TEXT,
    "preparationId" TEXT,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "tactic" JSONB,
    "outcome" JSONB NOT NULL,
    "sourceEventIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "OperationalEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationShift_restaurantId_status_idx" ON "OperationShift"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "OperationShift_restaurantId_businessDate_idx" ON "OperationShift"("restaurantId", "businessDate");

-- CreateIndex
CREATE INDEX "OperationShift_restaurantId_businessDate_segment_idx" ON "OperationShift"("restaurantId", "businessDate", "segment");

-- CreateIndex
CREATE INDEX "Coordination_restaurantId_shiftId_status_idx" ON "Coordination"("restaurantId", "shiftId", "status");

-- CreateIndex
CREATE INDEX "Coordination_restaurantId_status_priority_idx" ON "Coordination"("restaurantId", "status", "priority");

-- CreateIndex
CREATE INDEX "Coordination_shiftId_status_idx" ON "Coordination"("shiftId", "status");

-- CreateIndex
CREATE INDEX "Coordination_ackDeadlineAt_idx" ON "Coordination"("ackDeadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coordination_restaurantId_policyDedupeKey_key" ON "Coordination"("restaurantId", "policyDedupeKey");

-- CreateIndex
CREATE INDEX "Handoff_restaurantId_status_idx" ON "Handoff"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Handoff_fromShiftId_idx" ON "Handoff"("fromShiftId");

-- CreateIndex
CREATE INDEX "Handoff_toShiftId_idx" ON "Handoff"("toShiftId");

-- CreateIndex
CREATE INDEX "OperationalEpisode_restaurantId_businessDate_idx" ON "OperationalEpisode"("restaurantId", "businessDate");

-- CreateIndex
CREATE INDEX "OperationalEpisode_restaurantId_shiftId_idx" ON "OperationalEpisode"("restaurantId", "shiftId");

-- CreateIndex
CREATE INDEX "OperationalEpisode_coordinationId_idx" ON "OperationalEpisode"("coordinationId");

-- AddForeignKey
ALTER TABLE "OperationShift" ADD CONSTRAINT "OperationShift_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coordination" ADD CONSTRAINT "Coordination_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coordination" ADD CONSTRAINT "Coordination_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "OperationShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_fromShiftId_fkey" FOREIGN KEY ("fromShiftId") REFERENCES "OperationShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_toShiftId_fkey" FOREIGN KEY ("toShiftId") REFERENCES "OperationShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEpisode" ADD CONSTRAINT "OperationalEpisode_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEpisode" ADD CONSTRAINT "OperationalEpisode_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "OperationShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEpisode" ADD CONSTRAINT "OperationalEpisode_coordinationId_fkey" FOREIGN KEY ("coordinationId") REFERENCES "Coordination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
