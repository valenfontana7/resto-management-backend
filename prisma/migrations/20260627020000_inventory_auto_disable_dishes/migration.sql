-- Autocorte de platos vinculados cuando un insumo llega a stock 0
ALTER TABLE "InventoryItem" ADD COLUMN "autoDisableDishes" BOOLEAN NOT NULL DEFAULT false;

-- Marca platos deshabilitados automáticamente (vs. manual) para reactivación segura
ALTER TABLE "Dish" ADD COLUMN "autoDisabledByStock" BOOLEAN NOT NULL DEFAULT false;
