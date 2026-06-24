-- Verificación de email para owners (cuentas User)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL
  AND "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "AuthEmailVerificationLink" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthEmailVerificationLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthEmailVerificationLink_tokenHash_key"
  ON "AuthEmailVerificationLink"("tokenHash");

CREATE INDEX IF NOT EXISTS "AuthEmailVerificationLink_userId_idx"
  ON "AuthEmailVerificationLink"("userId");

CREATE INDEX IF NOT EXISTS "AuthEmailVerificationLink_expiresAt_idx"
  ON "AuthEmailVerificationLink"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuthEmailVerificationLink_userId_fkey'
  ) THEN
    ALTER TABLE "AuthEmailVerificationLink"
      ADD CONSTRAINT "AuthEmailVerificationLink_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
