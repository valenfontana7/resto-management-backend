CREATE TABLE IF NOT EXISTS "CustomerIdentity" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RestaurantCustomerProfile" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
  "defaultAddress" JSONB,
  "preferences" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RestaurantCustomerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerIdentity_email_key" ON "CustomerIdentity"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerIdentity_phone_key" ON "CustomerIdentity"("phone");
CREATE INDEX IF NOT EXISTS "CustomerIdentity_email_idx" ON "CustomerIdentity"("email");
CREATE INDEX IF NOT EXISTS "CustomerIdentity_phone_idx" ON "CustomerIdentity"("phone");

CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantCustomerProfile_restaurantId_identityId_key"
  ON "RestaurantCustomerProfile"("restaurantId", "identityId");
CREATE INDEX IF NOT EXISTS "RestaurantCustomerProfile_restaurantId_idx"
  ON "RestaurantCustomerProfile"("restaurantId");
CREATE INDEX IF NOT EXISTS "RestaurantCustomerProfile_identityId_idx"
  ON "RestaurantCustomerProfile"("identityId");
CREATE INDEX IF NOT EXISTS "RestaurantCustomerProfile_restaurantId_email_idx"
  ON "RestaurantCustomerProfile"("restaurantId", "email");
CREATE INDEX IF NOT EXISTS "RestaurantCustomerProfile_restaurantId_phone_idx"
  ON "RestaurantCustomerProfile"("restaurantId", "phone");

ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "customerProfileId" TEXT;

ALTER TABLE "Reservation"
ADD COLUMN IF NOT EXISTS "customerProfileId" TEXT;

ALTER TABLE "LoyaltyAccount"
ADD COLUMN IF NOT EXISTS "customerProfileId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_customerProfileId_idx" ON "Order"("customerProfileId");
CREATE INDEX IF NOT EXISTS "Reservation_customerProfileId_idx" ON "Reservation"("customerProfileId");
CREATE INDEX IF NOT EXISTS "LoyaltyAccount_customerProfileId_idx" ON "LoyaltyAccount"("customerProfileId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RestaurantCustomerProfile_identityId_fkey'
  ) THEN
    ALTER TABLE "RestaurantCustomerProfile"
    ADD CONSTRAINT "RestaurantCustomerProfile_identityId_fkey"
    FOREIGN KEY ("identityId") REFERENCES "CustomerIdentity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RestaurantCustomerProfile_restaurantId_fkey'
  ) THEN
    ALTER TABLE "RestaurantCustomerProfile"
    ADD CONSTRAINT "RestaurantCustomerProfile_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_customerProfileId_fkey'
  ) THEN
    ALTER TABLE "Order"
    ADD CONSTRAINT "Order_customerProfileId_fkey"
    FOREIGN KEY ("customerProfileId") REFERENCES "RestaurantCustomerProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Reservation_customerProfileId_fkey'
  ) THEN
    ALTER TABLE "Reservation"
    ADD CONSTRAINT "Reservation_customerProfileId_fkey"
    FOREIGN KEY ("customerProfileId") REFERENCES "RestaurantCustomerProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyAccount_customerProfileId_fkey'
  ) THEN
    ALTER TABLE "LoyaltyAccount"
    ADD CONSTRAINT "LoyaltyAccount_customerProfileId_fkey"
    FOREIGN KEY ("customerProfileId") REFERENCES "RestaurantCustomerProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
