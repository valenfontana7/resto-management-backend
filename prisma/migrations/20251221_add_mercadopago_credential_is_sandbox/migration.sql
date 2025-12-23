-- Migration: add isSandbox to MercadoPagoCredential

ALTER TABLE "MercadoPagoCredential" ADD COLUMN IF NOT EXISTS "isSandbox" boolean DEFAULT false;

-- ensure default and not null constraint if desired (keep nullable behavior)
