-- SubscriptionPlan marketing flags (used by seed, landing, and master plans UI)
ALTER TABLE "SubscriptionPlan"
ADD COLUMN IF NOT EXISTS "showOnLanding" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "SubscriptionPlan"
ADD COLUMN IF NOT EXISTS "isPopular" BOOLEAN NOT NULL DEFAULT false;
