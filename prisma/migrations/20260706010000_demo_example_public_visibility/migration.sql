-- AlterTable
ALTER TABLE "DemoExample" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DemoExample" ADD COLUMN "leadId" TEXT;

-- Backfill: demos de leads (sortOrder alto o leadId en payload) dejan de ser públicas.
UPDATE "DemoExample"
SET
  "isPublic" = false,
  "leadId" = COALESCE(
    "leadId",
    NULLIF(payload->>'leadId', '')
  )
WHERE "sortOrder" >= 9000
   OR (payload ? 'leadId' AND NULLIF(payload->>'leadId', '') IS NOT NULL);

-- CreateIndex
CREATE INDEX "DemoExample_isPublic_idx" ON "DemoExample"("isPublic");
CREATE INDEX "DemoExample_leadId_idx" ON "DemoExample"("leadId");
