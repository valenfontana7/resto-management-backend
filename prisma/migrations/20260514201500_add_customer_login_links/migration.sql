CREATE TABLE IF NOT EXISTS "CustomerLoginLink" (
  "id" TEXT NOT NULL,
  "customerProfileId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerLoginLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLoginLink_tokenHash_key"
  ON "CustomerLoginLink"("tokenHash");
CREATE INDEX IF NOT EXISTS "CustomerLoginLink_customerProfileId_idx"
  ON "CustomerLoginLink"("customerProfileId");
CREATE INDEX IF NOT EXISTS "CustomerLoginLink_expiresAt_idx"
  ON "CustomerLoginLink"("expiresAt");
CREATE INDEX IF NOT EXISTS "CustomerLoginLink_usedAt_idx"
  ON "CustomerLoginLink"("usedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerLoginLink_customerProfileId_fkey'
  ) THEN
    ALTER TABLE "CustomerLoginLink"
    ADD CONSTRAINT "CustomerLoginLink_customerProfileId_fkey"
    FOREIGN KEY ("customerProfileId") REFERENCES "RestaurantCustomerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;