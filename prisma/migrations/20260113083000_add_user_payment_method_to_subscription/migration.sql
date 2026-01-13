-- Migration: add userPaymentMethodId to Subscription
-- Generated: 2026-01-13

-- Add nullable userPaymentMethodId column to Subscription model
ALTER TABLE "Subscription"
ADD COLUMN IF NOT EXISTS "userPaymentMethodId" text;

-- Optional index to speed lookups by userPaymentMethodId
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_subscription_userpaymentmethodid'
  ) THEN
    CREATE INDEX idx_subscription_userpaymentmethodid ON "Subscription" ("userPaymentMethodId");
  END IF;
END$$;
