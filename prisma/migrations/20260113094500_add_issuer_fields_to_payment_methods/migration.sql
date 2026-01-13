-- Migration: add issuerId and issuerName to SubscriptionPaymentMethod and ensure on UserPaymentMethod
-- Generated: 2026-01-13

-- Add nullable issuerId/issuerName to subscription_payment_method table
ALTER TABLE "SubscriptionPaymentMethod"
ADD COLUMN IF NOT EXISTS "issuerId" text;

ALTER TABLE "SubscriptionPaymentMethod"
ADD COLUMN IF NOT EXISTS "issuerName" text;

-- Ensure same columns exist on user_payment_method table (idempotent)
ALTER TABLE "UserPaymentMethod"
ADD COLUMN IF NOT EXISTS "issuerId" text;

ALTER TABLE "UserPaymentMethod"
ADD COLUMN IF NOT EXISTS "issuerName" text;

-- Optional indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_subscriptionpaymentmethod_issuerid'
  ) THEN
    CREATE INDEX idx_subscriptionpaymentmethod_issuerid ON "SubscriptionPaymentMethod" ("issuerId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_userpaymentmethod_issuerid'
  ) THEN
    CREATE INDEX idx_userpaymentmethod_issuerid ON "UserPaymentMethod" ("issuerId");
  END IF;
END$$;
