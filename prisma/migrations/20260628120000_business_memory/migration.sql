-- CreateEnum
CREATE TYPE "BusinessMemoryCategory" AS ENUM ('OPERATIONAL', 'INVENTORY', 'SALES', 'MARKETING', 'CUSTOMER', 'RECOMMENDATION', 'CONFIGURATION', 'GROWTH');

-- CreateEnum
CREATE TYPE "BusinessMemoryStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'EXPIRED');

-- CreateTable
CREATE TABLE "BusinessMemory" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "memoryKey" TEXT NOT NULL,
    "category" "BusinessMemoryCategory" NOT NULL,
    "status" "BusinessMemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "sourceProvider" TEXT,
    "sourceInsightId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessMemory_restaurantId_status_idx" ON "BusinessMemory"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "BusinessMemory_restaurantId_category_status_idx" ON "BusinessMemory"("restaurantId", "category", "status");

-- CreateIndex
CREATE INDEX "BusinessMemory_restaurantId_lastSeenAt_idx" ON "BusinessMemory"("restaurantId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "BusinessMemory_expiresAt_idx" ON "BusinessMemory"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessMemory_restaurantId_memoryKey_key" ON "BusinessMemory"("restaurantId", "memoryKey");

-- AddForeignKey
ALTER TABLE "BusinessMemory" ADD CONSTRAINT "BusinessMemory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
