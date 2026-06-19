-- Caja parcial: snapshot del comprobante de cierre
ALTER TABLE "CashRegisterSession" ADD COLUMN "closeReport" JSONB;
