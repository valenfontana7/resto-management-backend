-- AlterTable
ALTER TABLE "CheckoutSession" ADD COLUMN     "paymentProvider" TEXT NOT NULL DEFAULT 'mercadopago';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paymentProvider" TEXT NOT NULL DEFAULT 'mercadopago';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentProvider" TEXT NOT NULL DEFAULT 'mercadopago';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "paymentProvider" TEXT NOT NULL DEFAULT 'mercadopago';

-- CreateTable
CREATE TABLE "PaymentProviderCredential" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "publicKey" TEXT,
    "secretKeyCipher" TEXT NOT NULL,
    "secretKeyLast4" TEXT,
    "merchantId" TEXT,
    "siteId" TEXT,
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentProviderCredential_restaurantId_idx" ON "PaymentProviderCredential"("restaurantId");

-- CreateIndex
CREATE INDEX "PaymentProviderCredential_provider_idx" ON "PaymentProviderCredential"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderCredential_restaurantId_provider_key" ON "PaymentProviderCredential"("restaurantId", "provider");

-- AddForeignKey
ALTER TABLE "PaymentProviderCredential" ADD CONSTRAINT "PaymentProviderCredential_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
