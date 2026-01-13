-- Migration: add user payment methods and subscription.userPaymentMethodId
BEGIN;

ALTER TABLE "Subscription"
ADD COLUMN IF NOT EXISTS "userPaymentMethodId" TEXT;

CREATE TABLE IF NOT EXISTS "UserPaymentMethod" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "mpCustomerId" TEXT,
  "mpCardId" TEXT,
  "type" TEXT NOT NULL,
  "brand" TEXT,
  "last4" TEXT,
  "expiryMonth" INTEGER,
  "expiryYear" INTEGER,
  "cardholderName" TEXT,
  "isDefault" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE "UserPaymentMethod" ADD CONSTRAINT "fk_userpaymentmethod_user" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

COMMIT;