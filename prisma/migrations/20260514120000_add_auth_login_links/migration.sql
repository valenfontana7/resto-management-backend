CREATE TABLE IF NOT EXISTS "AuthLoginLink" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuthLoginLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthLoginLink_tokenHash_key" ON "AuthLoginLink"("tokenHash");
CREATE INDEX IF NOT EXISTS "AuthLoginLink_userId_idx" ON "AuthLoginLink"("userId");
CREATE INDEX IF NOT EXISTS "AuthLoginLink_expiresAt_idx" ON "AuthLoginLink"("expiresAt");
CREATE INDEX IF NOT EXISTS "AuthLoginLink_usedAt_idx" ON "AuthLoginLink"("usedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AuthLoginLink_userId_fkey'
  ) THEN
    ALTER TABLE "AuthLoginLink"
    ADD CONSTRAINT "AuthLoginLink_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
