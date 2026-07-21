-- AlterTable
ALTER TABLE "Order" ADD COLUMN "kitchenReleasedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CheckoutSession" ADD COLUMN "scheduledFor" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_restaurantId_scheduledFor_idx" ON "Order"("restaurantId", "scheduledFor");
