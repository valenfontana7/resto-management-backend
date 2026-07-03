-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "demoFirstViewedAt" TIMESTAMP(3),
ADD COLUMN "demoLastViewedAt" TIMESTAMP(3),
ADD COLUMN "demoViewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Lead_demoLastViewedAt_idx" ON "Lead"("demoLastViewedAt");
