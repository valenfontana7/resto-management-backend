-- AlterTable: extender MercadoPagoCredential con campos OAuth
ALTER TABLE "MercadoPagoCredential"
  ADD COLUMN "refreshTokenCiphertext" TEXT,
  ADD COLUMN "refreshTokenLast4" TEXT,
  ADD COLUMN "mpUserId" TEXT,
  ADD COLUMN "scope" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "livemode" BOOLEAN,
  ADD COLUMN "connectedVia" TEXT NOT NULL DEFAULT 'manual';
