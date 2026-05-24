-- AlterTable
ALTER TABLE "PaymentProviderCredential" ADD COLUMN     "lastTestError" TEXT,
ADD COLUMN     "lastTestStatus" TEXT,
ADD COLUMN     "lastTestedAt" TIMESTAMP(3),
ADD COLUMN     "webhookSecretCipher" TEXT,
ADD COLUMN     "webhookSecretLast4" TEXT;
