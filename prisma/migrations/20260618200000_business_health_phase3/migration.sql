-- Fase 3: costo estimado por plato + inventario mínimo
ALTER TABLE "Dish" ADD COLUMN "costPrice" INTEGER;

CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "linkedDishIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryItem_restaurantId_idx" ON "InventoryItem"("restaurantId");

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
