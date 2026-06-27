-- Registro idempotente de descuento de stock por pedido cobrado
CREATE TABLE "OrderInventoryDeduction" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderInventoryDeduction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderInventoryDeduction_orderId_key" ON "OrderInventoryDeduction"("orderId");
CREATE INDEX "OrderInventoryDeduction_restaurantId_idx" ON "OrderInventoryDeduction"("restaurantId");

ALTER TABLE "OrderInventoryDeduction" ADD CONSTRAINT "OrderInventoryDeduction_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderInventoryDeduction" ADD CONSTRAINT "OrderInventoryDeduction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
