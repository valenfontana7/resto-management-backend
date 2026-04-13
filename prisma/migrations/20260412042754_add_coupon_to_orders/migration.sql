-- AlterTable
ALTER TABLE "CheckoutSession" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponId" TEXT;
