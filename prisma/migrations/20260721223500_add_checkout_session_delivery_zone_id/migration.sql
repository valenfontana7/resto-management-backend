ALTER TABLE "CheckoutSession"
ADD COLUMN IF NOT EXISTS "deliveryZoneId" TEXT;

CREATE INDEX IF NOT EXISTS "CheckoutSession_deliveryZoneId_idx"
ON "CheckoutSession"("deliveryZoneId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CheckoutSession_deliveryZoneId_fkey'
  ) THEN
    ALTER TABLE "CheckoutSession"
    ADD CONSTRAINT "CheckoutSession_deliveryZoneId_fkey"
    FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
