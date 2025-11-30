/*
  Warnings:

  - You are about to drop the column `section` on the `Table` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[currentOrderId]` on the table `Table` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[currentReservationId]` on the table `Table` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('SQUARE', 'ROUND', 'RECTANGLE');

-- DropIndex
DROP INDEX "Table_restaurantId_idx";

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Table" DROP COLUMN "section",
ADD COLUMN     "areaId" TEXT,
ADD COLUMN     "currentOrderId" TEXT,
ADD COLUMN     "currentReservationId" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "occupiedSince" TIMESTAMP(3),
ADD COLUMN     "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "shape" "TableShape" NOT NULL DEFAULT 'SQUARE',
ADD COLUMN     "waiter" TEXT;

-- CreateTable
CREATE TABLE "TableArea" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TableArea_restaurantId_idx" ON "TableArea"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_currentOrderId_key" ON "Table"("currentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_currentReservationId_key" ON "Table"("currentReservationId");

-- CreateIndex
CREATE INDEX "Table_restaurantId_status_idx" ON "Table"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Table_areaId_idx" ON "Table"("areaId");

-- AddForeignKey
ALTER TABLE "TableArea" ADD CONSTRAINT "TableArea_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "TableArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_currentOrderId_fkey" FOREIGN KEY ("currentOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_currentReservationId_fkey" FOREIGN KEY ("currentReservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
