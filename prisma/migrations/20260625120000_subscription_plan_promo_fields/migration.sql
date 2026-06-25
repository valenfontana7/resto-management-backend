-- Promo pricing for subscription plans (list price, badge, optional deadline)
ALTER TABLE "SubscriptionPlan"
ADD COLUMN IF NOT EXISTS "listPrice" INTEGER,
ADD COLUMN IF NOT EXISTS "promoBadge" TEXT,
ADD COLUMN IF NOT EXISTS "promoEndsAt" TIMESTAMP(3);
