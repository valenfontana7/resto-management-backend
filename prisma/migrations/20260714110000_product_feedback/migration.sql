-- CreateEnum
CREATE TYPE "ProductFeedbackType" AS ENUM ('BUG_REPORT', 'FEATURE_REQUEST', 'PRODUCT_FEEDBACK', 'INTEGRATION_REQUEST', 'GENERAL_COMMENT');

-- CreateEnum
CREATE TYPE "ProductFeedbackPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ProductFeedbackStatus" AS ENUM ('NEW', 'SEEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "ProductFeedback" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "userId" TEXT,
    "type" "ProductFeedbackType" NOT NULL,
    "title" TEXT,
    "message" TEXT NOT NULL,
    "category" TEXT,
    "priority" "ProductFeedbackPriority",
    "rating" INTEGER,
    "integrationPlatform" TEXT,
    "useCase" TEXT,
    "status" "ProductFeedbackStatus" NOT NULL DEFAULT 'NEW',
    "context" JSONB,
    "screenshotCount" INTEGER NOT NULL DEFAULT 0,
    "screenshotLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clientSubmissionId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductFeedback_status_submittedAt_idx" ON "ProductFeedback"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "ProductFeedback_type_submittedAt_idx" ON "ProductFeedback"("type", "submittedAt");

-- CreateIndex
CREATE INDEX "ProductFeedback_restaurantId_idx" ON "ProductFeedback"("restaurantId");

-- CreateIndex
CREATE INDEX "ProductFeedback_userId_idx" ON "ProductFeedback"("userId");

-- CreateIndex
CREATE INDEX "ProductFeedback_clientSubmissionId_idx" ON "ProductFeedback"("clientSubmissionId");

-- AddForeignKey
ALTER TABLE "ProductFeedback" ADD CONSTRAINT "ProductFeedback_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFeedback" ADD CONSTRAINT "ProductFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
