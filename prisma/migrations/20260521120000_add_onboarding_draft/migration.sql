-- CreateTable
CREATE TABLE "OnboardingDraft" (
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingDraft_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "OnboardingDraft_updatedAt_idx" ON "OnboardingDraft"("updatedAt");
