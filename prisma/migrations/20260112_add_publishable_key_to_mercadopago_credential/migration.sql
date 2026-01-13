-- Migration: add publishableKey to MercadoPagoCredential
BEGIN;

ALTER TABLE "MercadoPagoCredential"
ADD COLUMN IF NOT EXISTS "publishableKey" TEXT;

COMMIT;