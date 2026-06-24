-- Token público para consultar reservas sin exponer PII por UUID solo
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "publicAccessToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Reservation_publicAccessToken_key"
  ON "Reservation"("publicAccessToken");
