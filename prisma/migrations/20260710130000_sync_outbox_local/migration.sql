-- CreateEnum
CREATE TYPE "SyncOutboxStatus" AS ENUM ('PENDING', 'SYNCING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "SyncOutbox" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "clientMutationId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLocalCursor" (
    "restaurantId" TEXT NOT NULL,
    "streamKey" TEXT NOT NULL,
    "cursorValue" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "SyncOutbox_restaurantId_status_createdAt_idx" ON "SyncOutbox"("restaurantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncOutbox_restaurantId_clientMutationId_key" ON "SyncOutbox"("restaurantId", "clientMutationId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncLocalCursor_restaurantId_streamKey_key" ON "SyncLocalCursor"("restaurantId", "streamKey");

-- AddForeignKey
ALTER TABLE "SyncOutbox" ADD CONSTRAINT "SyncOutbox_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
