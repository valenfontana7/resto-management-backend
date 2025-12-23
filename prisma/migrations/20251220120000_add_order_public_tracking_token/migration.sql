-- AlterTable
ALTER TABLE "Order" ADD COLUMN "publicTrackingToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicTrackingToken_key" ON "Order"("publicTrackingToken");
