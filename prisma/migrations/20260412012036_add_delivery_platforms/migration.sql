-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('PEDIDOS_YA', 'RAPPI', 'UBER_EATS', 'CUSTOM');

-- CreateTable
CREATE TABLE "DeliveryPlatform" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "storeId" TEXT,
    "webhookSecret" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalOrder" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "externalStatus" TEXT NOT NULL,
    "internalOrderId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "deliveryAddress" TEXT,
    "items" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "platformFee" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "rawPayload" JSONB,
    "syncedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryPlatform_restaurantId_idx" ON "DeliveryPlatform"("restaurantId");

-- CreateIndex
CREATE INDEX "DeliveryPlatform_platform_isActive_idx" ON "DeliveryPlatform"("platform", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPlatform_restaurantId_platform_key" ON "DeliveryPlatform"("restaurantId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOrder_internalOrderId_key" ON "ExternalOrder"("internalOrderId");

-- CreateIndex
CREATE INDEX "ExternalOrder_restaurantId_idx" ON "ExternalOrder"("restaurantId");

-- CreateIndex
CREATE INDEX "ExternalOrder_externalStatus_idx" ON "ExternalOrder"("externalStatus");

-- CreateIndex
CREATE INDEX "ExternalOrder_createdAt_idx" ON "ExternalOrder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOrder_platformId_externalOrderId_key" ON "ExternalOrder"("platformId", "externalOrderId");

-- AddForeignKey
ALTER TABLE "DeliveryPlatform" ADD CONSTRAINT "DeliveryPlatform_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrder" ADD CONSTRAINT "ExternalOrder_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "DeliveryPlatform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrder" ADD CONSTRAINT "ExternalOrder_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrder" ADD CONSTRAINT "ExternalOrder_internalOrderId_fkey" FOREIGN KEY ("internalOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
