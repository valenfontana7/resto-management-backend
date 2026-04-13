-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "DigestPreference" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "frequency" "DigestFrequency" NOT NULL DEFAULT 'WEEKLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DigestPreference_restaurantId_idx" ON "DigestPreference"("restaurantId");

-- CreateIndex
CREATE INDEX "DigestPreference_frequency_isActive_idx" ON "DigestPreference"("frequency", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DigestPreference_restaurantId_email_key" ON "DigestPreference"("restaurantId", "email");

-- AddForeignKey
ALTER TABLE "DigestPreference" ADD CONSTRAINT "DigestPreference_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
