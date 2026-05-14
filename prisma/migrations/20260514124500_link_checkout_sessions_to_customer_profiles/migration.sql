ALTER TABLE "CheckoutSession"
ADD COLUMN IF NOT EXISTS "customerProfileId" TEXT;

CREATE INDEX IF NOT EXISTS "CheckoutSession_customerProfileId_idx"
  ON "CheckoutSession"("customerProfileId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CheckoutSession_customerProfileId_fkey'
  ) THEN
    ALTER TABLE "CheckoutSession"
    ADD CONSTRAINT "CheckoutSession_customerProfileId_fkey"
    FOREIGN KEY ("customerProfileId") REFERENCES "RestaurantCustomerProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
