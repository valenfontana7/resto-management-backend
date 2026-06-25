-- Suscripción por cuenta de dueño (userId) con ancla de cobro única por usuario.

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "isBillingAnchor" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_userId_key" ON "Subscription"("userId");

CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX IF NOT EXISTS "Subscription_isBillingAnchor_status_idx" ON "Subscription"("isBillingAnchor", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_userId_fkey'
  ) THEN
    ALTER TABLE "Subscription"
      ADD CONSTRAINT "Subscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
