-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('ONLINE', 'FLOOR_COMANDA', 'FLOOR_FINAL');

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ComandaItemStatus" AS ENUM ('PENDING', 'SENT', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashRegisterSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('SALE', 'REFUND', 'WITHDRAWAL', 'DEPOSIT', 'ADJUSTMENT', 'OPENING_FLOAT');

-- CreateEnum
CREATE TYPE "FiscalDocumentType" AS ENUM ('INTERNAL_TICKET', 'FACTURA_B', 'FACTURA_C', 'NOTA_CREDITO');

-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('DRAFT', 'PENDING_AFIP', 'AUTHORIZED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TerminalRole" AS ENUM ('SALON', 'KITCHEN', 'CASHIER', 'FISCAL');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "tableSessionId" TEXT,
ADD COLUMN "orderSource" "OrderSource" NOT NULL DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "Table" ADD COLUMN "currentSessionId" TEXT;

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "sessionNumber" TEXT NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "waiterId" TEXT,
    "waiterName" TEXT,
    "guestCount" INTEGER NOT NULL DEFAULT 1,
    "customerName" TEXT,
    "notes" TEXT,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "paymentMethodDiscount" INTEGER NOT NULL DEFAULT 0,
    "tip" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "cashRegisterSessionId" TEXT,
    "comandaRound" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSessionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "notes" TEXT,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "kitchenStatus" "ComandaItemStatus" NOT NULL DEFAULT 'PENDING',
    "comandaOrderId" TEXT,
    "sentToKitchenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableSessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSessionItemModifier" (
    "id" TEXT NOT NULL,
    "sessionItemId" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceAdjustment" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TableSessionItemModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashRegisterSession" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "terminalId" TEXT,
    "openedByUserId" TEXT NOT NULL,
    "openedByName" TEXT NOT NULL,
    "openingFloat" INTEGER NOT NULL DEFAULT 0,
    "expectedCash" INTEGER NOT NULL DEFAULT 0,
    "countedCash" INTEGER,
    "difference" INTEGER,
    "status" "CashRegisterSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "CashRegisterSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tableSessionId" TEXT,
    "type" "CashMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" TEXT,
    "orderId" TEXT,
    "description" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableSessionId" TEXT,
    "orderId" TEXT,
    "type" "FiscalDocumentType" NOT NULL,
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "puntoVenta" INTEGER,
    "numero" INTEGER,
    "cae" TEXT,
    "caeExpiresAt" TIMESTAMP(3),
    "customerDocType" TEXT,
    "customerDocNumber" TEXT,
    "customerName" TEXT,
    "subtotal" INTEGER NOT NULL,
    "ivaAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "payload" JSONB,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantTerminal" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "TerminalRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TableSession_orderId_key" ON "TableSession"("orderId");

-- CreateIndex
CREATE INDEX "TableSession_restaurantId_status_idx" ON "TableSession"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "TableSession_tableId_idx" ON "TableSession"("tableId");

-- CreateIndex
CREATE INDEX "TableSession_restaurantId_openedAt_idx" ON "TableSession"("restaurantId", "openedAt");

-- CreateIndex
CREATE INDEX "TableSessionItem_sessionId_idx" ON "TableSessionItem"("sessionId");

-- CreateIndex
CREATE INDEX "TableSessionItem_sessionId_kitchenStatus_idx" ON "TableSessionItem"("sessionId", "kitchenStatus");

-- CreateIndex
CREATE INDEX "TableSessionItemModifier_sessionItemId_idx" ON "TableSessionItemModifier"("sessionItemId");

-- CreateIndex
CREATE INDEX "CashRegisterSession_restaurantId_status_idx" ON "CashRegisterSession"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "CashMovement_sessionId_idx" ON "CashMovement"("sessionId");

-- CreateIndex
CREATE INDEX "CashMovement_tableSessionId_idx" ON "CashMovement"("tableSessionId");

-- CreateIndex
CREATE INDEX "FiscalDocument_restaurantId_idx" ON "FiscalDocument"("restaurantId");

-- CreateIndex
CREATE INDEX "FiscalDocument_tableSessionId_idx" ON "FiscalDocument"("tableSessionId");

-- CreateIndex
CREATE INDEX "FiscalDocument_restaurantId_type_status_idx" ON "FiscalDocument"("restaurantId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTerminal_restaurantId_name_key" ON "RestaurantTerminal"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "RestaurantTerminal_restaurantId_role_idx" ON "RestaurantTerminal"("restaurantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Table_currentSessionId_key" ON "Table"("currentSessionId");

-- CreateIndex
CREATE INDEX "Order_tableSessionId_idx" ON "Order"("tableSessionId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_currentSessionId_fkey" FOREIGN KEY ("currentSessionId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_cashRegisterSessionId_fkey" FOREIGN KEY ("cashRegisterSessionId") REFERENCES "CashRegisterSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSessionItem" ADD CONSTRAINT "TableSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSessionItem" ADD CONSTRAINT "TableSessionItem_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSessionItemModifier" ADD CONSTRAINT "TableSessionItemModifier_sessionItemId_fkey" FOREIGN KEY ("sessionItemId") REFERENCES "TableSessionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegisterSession" ADD CONSTRAINT "CashRegisterSession_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegisterSession" ADD CONSTRAINT "CashRegisterSession_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "RestaurantTerminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashRegisterSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTerminal" ADD CONSTRAINT "RestaurantTerminal_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
