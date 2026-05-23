UPDATE "SubscriptionPlan"
SET "order" = 1, "updatedAt" = NOW()
WHERE "id" = 'STARTER';

UPDATE "SubscriptionPlan"
SET "order" = 2, "updatedAt" = NOW()
WHERE "id" = 'PROFESSIONAL';

UPDATE "SubscriptionPlan"
SET "order" = 3, "updatedAt" = NOW()
WHERE "id" = 'ENTERPRISE';