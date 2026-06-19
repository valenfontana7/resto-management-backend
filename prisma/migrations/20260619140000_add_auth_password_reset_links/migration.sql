CREATE TABLE IF NOT EXISTS "AuthPasswordResetLink" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthPasswordResetLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthPasswordResetLink_tokenHash_key" ON "AuthPasswordResetLink"("tokenHash");
CREATE INDEX IF NOT EXISTS "AuthPasswordResetLink_userId_idx" ON "AuthPasswordResetLink"("userId");
CREATE INDEX IF NOT EXISTS "AuthPasswordResetLink_expiresAt_idx" ON "AuthPasswordResetLink"("expiresAt");
CREATE INDEX IF NOT EXISTS "AuthPasswordResetLink_usedAt_idx" ON "AuthPasswordResetLink"("usedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuthPasswordResetLink_userId_fkey'
  ) THEN
    ALTER TABLE "AuthPasswordResetLink"
    ADD CONSTRAINT "AuthPasswordResetLink_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
