-- AlterTable
ALTER TABLE "RestaurantOperationalProfile" ADD COLUMN "experienceProfileId" TEXT,
ADD COLUMN "experienceProfileInferredAt" TIMESTAMP(3),
ADD COLUMN "experienceProfileOverrideByUserId" TEXT;

-- CreateIndex
CREATE INDEX "RestaurantOperationalProfile_experienceProfileId_idx" ON "RestaurantOperationalProfile"("experienceProfileId");
