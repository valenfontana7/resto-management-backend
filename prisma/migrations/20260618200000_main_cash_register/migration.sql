-- Caja mayor: nivel de sesión y vínculo depósito desde parcial
CREATE TYPE "CashRegisterLevel" AS ENUM ('PARTIAL', 'MAIN');

ALTER TABLE "CashRegisterSession" ADD COLUMN "level" "CashRegisterLevel" NOT NULL DEFAULT 'PARTIAL';

ALTER TABLE "CashMovement" ADD COLUMN "sourceSessionId" TEXT;

CREATE INDEX "CashRegisterSession_restaurantId_status_level_idx" ON "CashRegisterSession"("restaurantId", "status", "level");

CREATE INDEX "CashMovement_sourceSessionId_idx" ON "CashMovement"("sourceSessionId");

ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sourceSessionId_fkey" FOREIGN KEY ("sourceSessionId") REFERENCES "CashRegisterSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
