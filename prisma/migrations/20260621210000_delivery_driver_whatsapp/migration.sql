-- AlterTable
ALTER TABLE "DeliveryDriver" ADD COLUMN "whatsappNotifyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeliveryDriver" ADD COLUMN "whatsappApiKey" TEXT;
