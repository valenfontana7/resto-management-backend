-- CreateTable
CREATE TABLE "LeadDiscoverySession" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "filters" JSONB,
    "results" JSONB NOT NULL,
    "model" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadDiscoverySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadDiscoverySession_createdAt_idx" ON "LeadDiscoverySession"("createdAt");
