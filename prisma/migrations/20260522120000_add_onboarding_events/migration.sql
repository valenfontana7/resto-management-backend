-- CreateTable
CREATE TABLE "OnboardingEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "userId" TEXT,
    "restaurantId" TEXT,
    "props" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingEvent_sessionId_idx" ON "OnboardingEvent"("sessionId");

-- CreateIndex
CREATE INDEX "OnboardingEvent_event_idx" ON "OnboardingEvent"("event");

-- CreateIndex
CREATE INDEX "OnboardingEvent_createdAt_idx" ON "OnboardingEvent"("createdAt");

-- CreateIndex
CREATE INDEX "OnboardingEvent_userId_idx" ON "OnboardingEvent"("userId");

-- CreateIndex
CREATE INDEX "OnboardingEvent_restaurantId_idx" ON "OnboardingEvent"("restaurantId");
