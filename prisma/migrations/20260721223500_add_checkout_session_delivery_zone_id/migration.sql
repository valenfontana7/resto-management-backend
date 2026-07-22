ALTER TABLE "CheckoutSession"
ADD COLUMN "deliveryZoneId" TEXT;

CREATE INDEX "CheckoutSession_deliveryZoneId_idx"
ON "CheckoutSession"("deliveryZoneId");

ALTER TABLE "CheckoutSession"
ADD CONSTRAINT "CheckoutSession_deliveryZoneId_fkey"
FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
