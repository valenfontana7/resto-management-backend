-- Split de cuenta: marcar ítems ya cobrados en una sesión de mesa
ALTER TABLE "TableSessionItem" ADD COLUMN "paidInOrderId" TEXT;

CREATE INDEX "TableSessionItem_sessionId_paidInOrderId_idx" ON "TableSessionItem"("sessionId", "paidInOrderId");
