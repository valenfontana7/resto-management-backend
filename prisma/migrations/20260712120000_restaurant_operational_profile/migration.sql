-- CreateTable
CREATE TABLE "RestaurantOperationalProfile" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "operationalModel" TEXT NOT NULL DEFAULT 'mixed',
    "maturityLevel" TEXT NOT NULL DEFAULT 'basic',
    "focusAreas" JSONB NOT NULL DEFAULT '[]',
    "businessPriorities" JSONB NOT NULL DEFAULT '{}',
    "capabilitySnapshot" JSONB,
    "profileStatus" TEXT NOT NULL DEFAULT 'pending',
    "completedWizardVersion" INTEGER,
    "completedStepIds" JSONB NOT NULL DEFAULT '[]',
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "migratedFromLegacy" BOOLEAN NOT NULL DEFAULT false,
    "migrationSource" TEXT,
    "dismissedHints" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantOperationalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantOperationalProfile_restaurantId_key" ON "RestaurantOperationalProfile"("restaurantId");

-- CreateIndex
CREATE INDEX "RestaurantOperationalProfile_profileStatus_idx" ON "RestaurantOperationalProfile"("profileStatus");

-- CreateIndex
CREATE INDEX "RestaurantOperationalProfile_operationalModel_idx" ON "RestaurantOperationalProfile"("operationalModel");

-- AddForeignKey
ALTER TABLE "RestaurantOperationalProfile" ADD CONSTRAINT "RestaurantOperationalProfile_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
