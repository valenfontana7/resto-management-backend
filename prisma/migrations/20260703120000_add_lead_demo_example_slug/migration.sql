-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "demoExampleSlug" TEXT;

-- CreateIndex
CREATE INDEX "Lead_demoExampleSlug_idx" ON "Lead"("demoExampleSlug");
