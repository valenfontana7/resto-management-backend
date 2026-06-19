-- Caja diaria: cierre contable del día en DailyOperation
ALTER TABLE "DailyOperation" ADD COLUMN "dailyCloseReport" JSONB;
ALTER TABLE "DailyOperation" ADD COLUMN "dailyClosedAt" TIMESTAMP(3);
ALTER TABLE "DailyOperation" ADD COLUMN "dailyClosedByName" TEXT;
