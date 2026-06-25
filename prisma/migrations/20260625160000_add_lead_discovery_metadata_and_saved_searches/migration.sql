-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "discoveredWithAi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "discoverySessionId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "discoverySourceUrl" TEXT;

-- CreateIndex
CREATE INDEX "Lead_discoveredWithAi_idx" ON "Lead"("discoveredWithAi");

-- CreateTable
CREATE TABLE "LeadSavedSearch" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "query" TEXT NOT NULL,
    "filters" JSONB,
    "schedule" TEXT NOT NULL DEFAULT 'manual',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSavedSearch_enabled_nextRunAt_idx" ON "LeadSavedSearch"("enabled", "nextRunAt");
CREATE INDEX "LeadSavedSearch_createdById_idx" ON "LeadSavedSearch"("createdById");
CREATE INDEX "LeadSavedSearch_createdAt_idx" ON "LeadSavedSearch"("createdAt");
