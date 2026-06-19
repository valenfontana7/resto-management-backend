-- Daily operation checklists (apertura/cierre del día)
CREATE TABLE "DailyOperation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "dailyGoal" TEXT,
    "openingChecklist" JSONB,
    "openingCompletedAt" TIMESTAMP(3),
    "openingNotes" TEXT,
    "closingChecklist" JSONB,
    "closingCompletedAt" TIMESTAMP(3),
    "closingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyOperation_restaurantId_businessDate_key" ON "DailyOperation"("restaurantId", "businessDate");
CREATE INDEX "DailyOperation_restaurantId_businessDate_idx" ON "DailyOperation"("restaurantId", "businessDate");

ALTER TABLE "DailyOperation" ADD CONSTRAINT "DailyOperation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
