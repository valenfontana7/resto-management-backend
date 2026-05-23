-- Directo dejó de ser un plan gratuito: debe iniciar trial y cobrar luego del período de prueba.
UPDATE "SubscriptionPlan"
SET
  "displayName" = 'Directo',
  "price" = 2500000,
  "trialDays" = 14,
  "isActive" = true,
  "isDefault" = true,
  "updatedAt" = NOW()
WHERE "id" = 'STARTER';

UPDATE "SubscriptionPlan"
SET
  "displayName" = 'Operación',
  "price" = 4500000,
  "trialDays" = 14,
  "isActive" = true,
  "updatedAt" = NOW()
WHERE "id" = 'PROFESSIONAL';

UPDATE "SubscriptionPlan"
SET
  "displayName" = 'Full',
  "price" = 7000000,
  "trialDays" = 14,
  "isActive" = true,
  "updatedAt" = NOW()
WHERE "id" = 'ENTERPRISE';

-- Corregir altas automáticas antiguas de Directo que quedaron como cuenta gratuita
-- por la regla obsoleta STARTER=gratis. No tocamos suscripciones con descuentos explícitos.
UPDATE "Subscription" AS s
SET
  "status" = 'TRIALING'::"SubscriptionStatus",
  "trialStart" = NOW(),
  "trialEnd" = NOW() + INTERVAL '14 days',
  "currentPeriodStart" = NOW(),
  "currentPeriodEnd" = NOW() + INTERVAL '14 days',
  "nextPaymentDate" = NOW() + INTERVAL '14 days',
  "isFreeAccount" = false,
  "updatedAt" = NOW()
WHERE s."planType" = 'STARTER'::"PlanType"
  AND s."status" = 'ACTIVE'::"SubscriptionStatus"
  AND s."isFreeAccount" = true
  AND s."trialStart" IS NULL
  AND s."trialEnd" IS NULL
  AND s."nextPaymentDate" IS NULL
  AND s."discountGrantedBy" IS NULL
  AND s."discountPercentage" IS NULL;