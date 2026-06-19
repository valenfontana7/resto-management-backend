-- Precios y disponibilidad por canal (online vs salón)
ALTER TABLE "Dish" ADD COLUMN "salonPrice" INTEGER;
ALTER TABLE "Dish" ADD COLUMN "isAvailableInSalon" BOOLEAN NOT NULL DEFAULT true;
