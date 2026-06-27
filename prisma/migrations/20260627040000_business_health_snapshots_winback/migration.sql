-- Snapshots diarios de score de salud + log de win-back
CREATE TABLE "BusinessHealthSnapshot" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "overall" INTEGER NOT NULL,
    "operational" INTEGER NOT NULL,
    "commercial" INTEGER NOT NULL,
    "margin" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessHealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WinBackEmailLog" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerKey" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinBackEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessHealthSnapshot_restaurantId_snapshotDate_key" ON "BusinessHealthSnapshot"("restaurantId", "snapshotDate");
CREATE INDEX "BusinessHealthSnapshot_restaurantId_snapshotDate_idx" ON "BusinessHealthSnapshot"("restaurantId", "snapshotDate");

CREATE INDEX "WinBackEmailLog_restaurantId_customerKey_sentAt_idx" ON "WinBackEmailLog"("restaurantId", "customerKey", "sentAt");
CREATE INDEX "WinBackEmailLog_restaurantId_sentAt_idx" ON "WinBackEmailLog"("restaurantId", "sentAt");

ALTER TABLE "BusinessHealthSnapshot" ADD CONSTRAINT "BusinessHealthSnapshot_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WinBackEmailLog" ADD CONSTRAINT "WinBackEmailLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
