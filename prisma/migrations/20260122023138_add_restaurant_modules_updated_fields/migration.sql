/*
  Warnings:

  - Made the column `isSandbox` on table `MercadoPagoCredential` required. This step will fail if there are existing NULL values in that column.
  - Made the column `isDefault` on table `UserPaymentMethod` required. This step will fail if there are existing NULL values in that column.
  - Made the column `createdAt` on table `UserPaymentMethod` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FIXED');

-- DropForeignKey
ALTER TABLE "UserPaymentMethod" DROP CONSTRAINT "fk_userpaymentmethod_user";

-- DropIndex
DROP INDEX "BusinessHour_restaurantId_dayOfWeek_key";

-- DropIndex
DROP INDEX "idx_subscription_userpaymentmethodid";

-- DropIndex
DROP INDEX "idx_subscriptionpaymentmethod_issuerid";

-- DropIndex
DROP INDEX "idx_userpaymentmethod_issuerid";

-- AlterTable
ALTER TABLE "MercadoPagoCredential" ALTER COLUMN "isSandbox" SET NOT NULL;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "businessRules" JSONB,
ADD COLUMN IF NOT EXISTS "modulesUpdatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "modulesUpdatedBy" TEXT;

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserPaymentMethod" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "isDefault" SET NOT NULL,
ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CouponType" NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "minOrderAmount" DECIMAL(65,30),
    "maxDiscountAmount" DECIMAL(65,30),
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "applicableProducts" TEXT[],
    "applicableCategories" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponUsage" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT,
    "customerId" TEXT,
    "discountAmount" DECIMAL(65,30) NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Coupon_restaurantId_idx" ON "Coupon"("restaurantId");

-- CreateIndex
CREATE INDEX "Coupon_restaurantId_isActive_idx" ON "Coupon"("restaurantId", "isActive");

-- CreateIndex
CREATE INDEX "Coupon_restaurantId_validUntil_idx" ON "Coupon"("restaurantId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_restaurantId_code_key" ON "Coupon"("restaurantId", "code");

-- CreateIndex
CREATE INDEX "CouponUsage_couponId_idx" ON "CouponUsage"("couponId");

-- CreateIndex
CREATE INDEX "CouponUsage_customerId_idx" ON "CouponUsage"("customerId");

-- CreateIndex
CREATE INDEX "CouponUsage_usedAt_idx" ON "CouponUsage"("usedAt");

-- CreateIndex
CREATE INDEX "BusinessHour_restaurantId_dayOfWeek_idx" ON "BusinessHour"("restaurantId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "UserPaymentMethod_userId_idx" ON "UserPaymentMethod"("userId");

-- AddForeignKey
ALTER TABLE "UserPaymentMethod" ADD CONSTRAINT "UserPaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
