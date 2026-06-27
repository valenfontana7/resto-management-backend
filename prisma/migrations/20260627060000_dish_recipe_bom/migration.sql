-- Costo unitario del insumo (centavos) + receta BOM por plato
ALTER TABLE "InventoryItem" ADD COLUMN "unitCost" INTEGER;

CREATE TABLE "DishRecipeLine" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DishRecipeLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DishRecipeLine_dishId_inventoryItemId_key" ON "DishRecipeLine"("dishId", "inventoryItemId");
CREATE INDEX "DishRecipeLine_dishId_idx" ON "DishRecipeLine"("dishId");
CREATE INDEX "DishRecipeLine_inventoryItemId_idx" ON "DishRecipeLine"("inventoryItemId");

ALTER TABLE "DishRecipeLine" ADD CONSTRAINT "DishRecipeLine_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DishRecipeLine" ADD CONSTRAINT "DishRecipeLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
