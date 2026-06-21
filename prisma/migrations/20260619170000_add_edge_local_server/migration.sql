-- CreateEnum
CREATE TYPE "EdgeLocalServerStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "EdgeLocalServer" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "syncTokenHash" TEXT NOT NULL,
    "hostname" TEXT,
    "version" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastLanUrl" TEXT,
    "lastSyncPullAt" TIMESTAMP(3),
    "lastSyncPushAt" TIMESTAMP(3),
    "pendingPushCount" INTEGER NOT NULL DEFAULT 0,
    "status" "EdgeLocalServerStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeLocalServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EdgeSyncCursor" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "streamKey" TEXT NOT NULL,
    "cursorValue" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EdgeLocalServer_restaurantId_key" ON "EdgeLocalServer"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "EdgeLocalServer_localId_key" ON "EdgeLocalServer"("localId");

-- CreateIndex
CREATE INDEX "EdgeLocalServer_status_idx" ON "EdgeLocalServer"("status");

-- CreateIndex
CREATE INDEX "EdgeLocalServer_lastHeartbeatAt_idx" ON "EdgeLocalServer"("lastHeartbeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "EdgeSyncCursor_restaurantId_localId_streamKey_key" ON "EdgeSyncCursor"("restaurantId", "localId", "streamKey");

-- CreateIndex
CREATE INDEX "EdgeSyncCursor_restaurantId_streamKey_idx" ON "EdgeSyncCursor"("restaurantId", "streamKey");

-- AddForeignKey
ALTER TABLE "EdgeLocalServer" ADD CONSTRAINT "EdgeLocalServer_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdgeSyncCursor" ADD CONSTRAINT "EdgeSyncCursor_localId_fkey" FOREIGN KEY ("localId") REFERENCES "EdgeLocalServer"("localId") ON DELETE CASCADE ON UPDATE CASCADE;
